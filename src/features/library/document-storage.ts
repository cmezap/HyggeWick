import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import {
  deleteBook,
  getAllBooks,
  getBookByContentHash,
  getBookById,
  isFilePathReferenced,
  insertBook,
  migrateLegacyCatalog,
  updateBookMetadata,
  updateBookContentHash,
  type Book,
} from './book-repository';

export type ImportedDocument = {
  id: string;
  originalName: string;
  internalFileName: string;
  sizeBytes: number;
  importedAt: string;
  duplicate?: boolean;
};

/** Returns SQLite metadata, including entries whose managed PDF has gone missing. */
export async function getLibraryBooks(): Promise<Book[]> {
  // This also performs the existing catalog recovery and reconciles missing files.
  await listImportedDocuments();
  return getAllBooks();
}

function importedDocument(book: Book): ImportedDocument {
  return {
    id: book.id,
    originalName: book.originalFileName,
    internalFileName: book.filePath.split('/').pop() ?? book.filePath,
    sizeBytes: book.fileSize,
    importedAt: book.dateAdded,
  };
}

export class DocumentStorageError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'invalid_name'
      | 'insufficient_space'
      | 'document_missing'
      | 'storage_failure',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentStorageError';
  }
}

const libraryDirectory = new Directory(Paths.document, 'hyggewick-library');
const coversDirectory = new Directory(libraryDirectory, 'covers');
const registryFileName = 'documents.json';
const managedNamePattern = /^([\da-f-]{36})--(.+)$/i;

function registryFile() {
  return new File(libraryDirectory, registryFileName);
}

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** Copies a selected image into app-private cover storage, separate from managed PDFs. */
export async function storeBookCover(sourceUri: string, fileName: string): Promise<string> {
  try {
    if (!libraryDirectory.exists) libraryDirectory.create({ intermediates: true });
    if (!coversDirectory.exists) coversDirectory.create({ intermediates: true });
    const extension = /\.(jpe?g|png|webp|gif|heic)$/i.exec(fileName)?.[0]?.toLowerCase() ?? '.img';
    const destination = new File(coversDirectory, `${createId()}${extension}`);
    await LegacyFileSystem.copyAsync({ from: sourceUri, to: destination.uri });
    if (!destination.exists || destination.size <= 0) {
      if (destination.exists) destination.delete();
      throw new Error('Empty cover image');
    }
    return destination.uri;
  } catch {
    throw new DocumentStorageError('storage_failure', 'No se pudo guardar la imagen de portada. Inténtalo de nuevo.');
  }
}

async function hashFile(file: File) {
  return file.digest('SHA-256');
}

function isImportedDocument(value: unknown): value is ImportedDocument {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ImportedDocument>;
  if (
    typeof record.id !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(record.id) ||
    typeof record.originalName !== 'string' ||
    typeof record.internalFileName !== 'string' ||
    !record.internalFileName.startsWith(`${record.id}--`) ||
    typeof record.sizeBytes !== 'number' ||
    !Number.isFinite(record.sizeBytes) || record.sizeBytes < 0 ||
    typeof record.importedAt !== 'string' || !Number.isFinite(Date.parse(record.importedAt))
  ) return false;
  try {
    return record.originalName.trim().toLocaleLowerCase().endsWith('.pdf') &&
      decodeURIComponent(record.internalFileName.slice(record.id.length + 2)) === record.originalName;
  } catch {
    return false;
  }
}

function recoveredDocument(file: File): ImportedDocument | null {
  const match = managedNamePattern.exec(file.name);
  if (!match) return null;

  try {
    const originalName = decodeURIComponent(match[2]!);
    if (!originalName.toLocaleLowerCase().endsWith('.pdf')) return null;
    return {
      id: match[1]!,
      originalName,
      internalFileName: file.name,
      sizeBytes: file.size,
      importedAt: new Date(file.creationTime ?? file.modificationTime ?? Date.now()).toISOString(),
    };
  } catch {
    return null;
  }
}

async function readRegistry(): Promise<{ documents: ImportedDocument[]; corrupted: boolean }> {
  const file = registryFile();
  if (!file.exists) return { documents: [], corrupted: false };

  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('documents' in parsed) ||
      !Array.isArray(parsed.documents)
    ) {
      return { documents: [], corrupted: true };
    }
    return {
      documents: parsed.documents.filter(isImportedDocument),
      corrupted: parsed.documents.some((entry) => !isImportedDocument(entry)),
    };
  } catch {
    return { documents: [], corrupted: true };
  }
}

export async function listImportedDocuments(): Promise<ImportedDocument[]> {
  if (!libraryDirectory.exists) libraryDirectory.create({ intermediates: true });
  await migrateLegacyCatalog(readRegistry, (document) => {
    const file = new File(libraryDirectory, document.internalFileName);
    return file.exists ? file.uri : null;
  });
  const files = libraryDirectory.list().filter((entry): entry is File => entry instanceof File);
  for (const file of files) {
    if (/^(?:import|documents)-[\da-f-]+\.tmp$/i.test(file.name)) file.delete();
  }
  const books = await getAllBooks();
  const filesByPath = new Map(files.map((file) => [file.uri, file]));
  const documentsById = new Map<string, ImportedDocument>();

  for (const book of books) {
    const file = filesByPath.get(book.filePath);
    if (!file?.exists) {
      if (book.status !== 'missing') await updateBookMetadata(book.id, { status: 'missing' });
      continue;
    }
    if (book.status === 'missing') await updateBookMetadata(book.id, { status: 'available' });
    documentsById.set(book.id, { ...importedDocument(book), sizeBytes: file.size });
  }

  // The generated filename retains enough identity to recover a document when metadata is damaged.
  for (const file of files) {
    const recovered = recoveredDocument(file);
    if (recovered && !documentsById.has(recovered.id)) {
      const file = new File(libraryDirectory, recovered.internalFileName);
      await insertBook({
        id: recovered.id,
        title: recovered.originalName,
        originalFileName: recovered.originalName,
        filePath: file.uri,
        fileSize: file.size,
        dateAdded: recovered.importedAt,
      });
      documentsById.set(recovered.id, recovered);
    }
  }

  const documents = [...documentsById.values()].sort(
    (left, right) => new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
  );
  return documents;
}

export async function importPdf(sourceUri: string, originalName: string, reportedSize?: number) {
  const uriScheme = sourceUri.match(/^[a-z][a-z\d+.-]*:/i)?.[0] ?? 'unknown';
  if (__DEV__) console.info('[PDF import] storage input', { name: originalName, reportedSize, uriScheme });
  const name = originalName.trim();
  if (!name || name === '.' || name === '..') {
    throw new DocumentStorageError('invalid_name', 'El archivo no tiene un nombre válido.');
  }
  if (!name.toLocaleLowerCase().endsWith('.pdf')) {
    throw new DocumentStorageError('invalid_pdf', 'Selecciona un archivo con formato PDF.');
  }

  if (!libraryDirectory.exists) libraryDirectory.create({ intermediates: true });

  try {
    const sizeBytes = reportedSize && reportedSize > 0 ? reportedSize : undefined;
    if (sizeBytes !== undefined && sizeBytes > Paths.availableDiskSpace) {
      throw new DocumentStorageError('insufficient_space', 'No hay espacio suficiente para importar este PDF.');
    }

    await listImportedDocuments();
    const existingBooks = await getAllBooks();
    for (const book of existingBooks) {
      if (book.contentHash || book.status === 'missing') continue;
      const existingFile = new File(book.filePath);
      if (existingFile.exists) {
        try { await updateBookContentHash(book.id, await hashFile(existingFile)); } catch { /* Keep legacy books importable if hashing fails. */ }
      }
    }
    let id = createId();
    let internalFileName = `${id}--${encodeURIComponent(name)}`;
    let temporary = new File(libraryDirectory, `import-${id}.tmp`);
    while (
      existingBooks.some((book) => book.id === id) ||
      new File(libraryDirectory, internalFileName).exists ||
      temporary.exists
    ) {
      id = createId();
      internalFileName = `${id}--${encodeURIComponent(name)}`;
      temporary = new File(libraryDirectory, `import-${id}.tmp`);
    }

    const destination = new File(libraryDirectory, internalFileName);
    try {
      // Copy the original SAF content:// URI. The DocumentPicker cache copy may be
      // outside this Expo Go experience's FileSystem permission scope.
      await LegacyFileSystem.copyAsync({ from: sourceUri, to: temporary.uri });
      if (__DEV__) console.info('[PDF import] temporary copy', { exists: temporary.exists, size: temporary.size });
      if (!temporary.exists || temporary.size <= 0) {
        throw new DocumentStorageError('storage_failure', 'No se pudo completar la copia del PDF.');
      }

      if (sizeBytes !== undefined && temporary.size !== sizeBytes) {
        throw new DocumentStorageError('storage_failure', 'La copia del PDF quedó incompleta.');
      }

      const headerBase64 = await LegacyFileSystem.readAsStringAsync(temporary.uri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
        position: 0,
        length: Math.min(temporary.size, 1024),
      });
      const pdfMarkerFound = headerBase64.startsWith('JVBERi0');
      if (__DEV__) console.info('[PDF import] copied-file header', { bytesRead: Math.min(temporary.size, 1024), pdfMarkerFound });
      if (!pdfMarkerFound) {
        throw new DocumentStorageError('invalid_pdf', 'El archivo seleccionado no parece ser un PDF válido.');
      }

      const contentHash = await hashFile(temporary);
      const duplicate = await getBookByContentHash(contentHash);
      if (duplicate) {
        temporary.delete();
        return { ...importedDocument(duplicate), duplicate: true };
      }

      await temporary.move(destination);
      if (__DEV__) console.info('[PDF import] final move', { exists: destination.exists, size: destination.size });

      const document: ImportedDocument = {
        id,
        originalName: name,
        internalFileName,
        sizeBytes: destination.size,
        importedAt: new Date().toISOString(),
      };
      await insertBook({
        id,
        title: name,
        originalFileName: name,
        filePath: destination.uri,
        fileSize: destination.size,
        contentHash,
        dateAdded: document.importedAt,
      });
      return document;
    } catch (error) {
      if (temporary.exists) temporary.delete();
      if (destination.exists) destination.delete();
      throw error;
    }
  } catch (error) {
    if (error instanceof DocumentStorageError) throw error;
    if (__DEV__) console.error('[PDF import] storage exception', error);
    throw new DocumentStorageError('storage_failure', 'No se pudo importar el PDF. Comprueba el archivo y el espacio disponible e inténtalo de nuevo.');
  }
}

function describeImportException(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const detail = error as { name?: unknown; message?: unknown; stack?: unknown };
    return { name: detail.name, message: detail.message, stack: detail.stack };
  }
  return { name: typeof error, message: String(error) };
}

export async function removeImportedDocument(document: ImportedDocument) {
  const book = await getBookById(document.id);
  if (!book) return;
  const file = new File(book.filePath);
  try {
    // Check while this record still exists. A shared path must remain on disk.
    const shared = await isFilePathReferenced(book.filePath, book.id);
    if (!shared && file.exists) {
      file.delete();
      if (file.exists) throw new Error('The managed PDF still exists after deletion.');
    }
    await deleteBook(document.id);
  } catch {
    throw new DocumentStorageError('storage_failure', 'No se pudo eliminar el PDF de HyggeWick.');
  }
}
