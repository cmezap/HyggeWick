import * as SQLite from 'expo-sqlite';

export type BookStatus = 'available' | 'missing';
export type ReadingState = 'pending' | 'reading' | 'finished';
export type Book = {
  id: string;
  title: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  contentHash: string | null;
  fileType: 'pdf';
  dateAdded: string;
  lastOpenedAt: string | null;
  currentPage: number;
  totalPages: number | null;
  readingProgress: number;
  readingState: ReadingState;
  isFavorite: boolean;
  status: BookStatus;
  author: string | null;
  description: string | null;
  genre: string | null;
  series: string | null;
  volumeNumber: string | null;
  language: string | null;
  coverPath: string | null;
  hideCoverDetails?: boolean;
  readingTimeSeconds: number;
  updatedAt: string;
};

export type ReadingOverview = {
  totalBooks: number;
  pendingBooks: number;
  readingBooks: number;
  finishedBooks: number;
  pagesRead: number;
  knownTotalPages: number;
  booksWithoutPageCount: number;
  globalProgress: number | null;
  totalReadingTimeSeconds: number;
};

/** Formats accumulated reading seconds into a concise, human-friendly label. */
export function formatReadingTime(totalSeconds: number, compact = false): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return compact ? '0 min' : 'Sin tiempo registrado';
  if (safe < 60) return compact ? `${safe} s` : `${safe} s`;
  const totalMinutes = Math.floor(safe / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Summarizes persisted page progress; unknown page totals are excluded from the global ratio. */
export function summarizeReadingProgress(books: readonly Book[]): ReadingOverview {
  const pageCountKnownBooks = books.filter((book) => book.totalPages != null && book.totalPages > 0);
  const knownTotalPages = pageCountKnownBooks.reduce((sum, book) => sum + book.totalPages!, 0);
  const pagesRead = Math.round(pageCountKnownBooks.reduce(
    (sum, book) => sum + book.readingProgress * book.totalPages!, 0,
  ));
  const totalReadingTimeSeconds = books.reduce((sum, book) => sum + (book.readingTimeSeconds ?? 0), 0);

  return {
    totalBooks: books.length,
    pendingBooks: books.filter((book) => book.readingState === 'pending').length,
    readingBooks: books.filter((book) => book.readingState === 'reading').length,
    finishedBooks: books.filter((book) => book.readingState === 'finished').length,
    pagesRead,
    knownTotalPages,
    booksWithoutPageCount: books.length - pageCountKnownBooks.length,
    globalProgress: knownTotalPages > 0 ? pagesRead / knownTotalPages : null,
    totalReadingTimeSeconds,
  };
}

export type NewBook = Pick<Book, 'id' | 'title' | 'originalFileName' | 'filePath' | 'fileSize' | 'dateAdded'> &
  Partial<Omit<Book, 'id' | 'title' | 'originalFileName' | 'filePath' | 'fileSize' | 'dateAdded'>>;

type LegacyDocument = {
  id: string;
  originalName: string;
  internalFileName: string;
  sizeBytes: number;
  importedAt: string;
};

const DATABASE_NAME = 'hyggewick.db';
const CATALOG_MIGRATION = 'legacy_documents_json_v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS books (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          original_file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL CHECK (file_size >= 0),
          content_hash TEXT,
          file_type TEXT NOT NULL DEFAULT 'pdf' CHECK (file_type = 'pdf'),
          date_added TEXT NOT NULL,
          last_opened_at TEXT,
          current_page INTEGER NOT NULL DEFAULT 1 CHECK (current_page >= 1),
          total_pages INTEGER CHECK (total_pages IS NULL OR total_pages >= 1),
          reading_progress REAL NOT NULL DEFAULT 0 CHECK (reading_progress >= 0 AND reading_progress <= 1),
          is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
          status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'missing')),
          author TEXT,
          description TEXT,
          genre TEXT,
          series TEXT,
          volume_number TEXT,
          language TEXT,
          cover_path TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS books_date_added_idx ON books(date_added DESC);
        CREATE TABLE IF NOT EXISTS schema_migrations (
          migration_id TEXT PRIMARY KEY NOT NULL,
          completed_at TEXT NOT NULL
        );
      `);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
      if (!columns.some((column) => column.name === 'content_hash')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN content_hash TEXT');
      }
      const existingColumns = new Set(columns.map((column) => column.name));
      for (const name of ['description', 'genre', 'series', 'volume_number', 'language']) {
        if (!existingColumns.has(name)) await db.execAsync(`ALTER TABLE books ADD COLUMN ${name} TEXT`);
      }
      if (!existingColumns.has('hide_cover_details')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN hide_cover_details INTEGER NOT NULL DEFAULT 0');
      }
      if (!existingColumns.has('reading_time_seconds')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN reading_time_seconds INTEGER NOT NULL DEFAULT 0');
      }
      await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS books_content_hash_idx ON books(content_hash) WHERE content_hash IS NOT NULL');
      return db;
    })().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function fromRow(row: Record<string, unknown>): Book {
  return {
    id: String(row.id), title: String(row.title), originalFileName: String(row.original_file_name),
    filePath: String(row.file_path), fileSize: Number(row.file_size), contentHash: row.content_hash == null ? null : String(row.content_hash), fileType: 'pdf',
    dateAdded: String(row.date_added), lastOpenedAt: row.last_opened_at == null ? null : String(row.last_opened_at),
    currentPage: Number(row.current_page), totalPages: row.total_pages == null ? null : Number(row.total_pages),
    readingProgress: Number(row.reading_progress),
    readingState: Number(row.total_pages) > 0 && Number(row.current_page) >= Number(row.total_pages) ? 'finished' : row.last_opened_at != null || Number(row.current_page) > 1 ? 'reading' : 'pending',
    isFavorite: Number(row.is_favorite) === 1,
    status: row.status === 'missing' ? 'missing' : 'available', author: row.author == null ? null : String(row.author),
    description: row.description == null ? null : String(row.description), genre: row.genre == null ? null : String(row.genre),
    series: row.series == null ? null : String(row.series), volumeNumber: row.volume_number == null ? null : String(row.volume_number),
    language: row.language == null ? null : String(row.language),
    coverPath: row.cover_path == null ? null : String(row.cover_path),
    hideCoverDetails: Number(row.hide_cover_details) === 1,
    readingTimeSeconds: row.reading_time_seconds == null ? 0 : Math.max(0, Number(row.reading_time_seconds)),
    updatedAt: String(row.updated_at),
  };
}

function values(book: Book) {
  return [book.id, book.title, book.originalFileName, book.filePath, book.fileSize, book.contentHash, book.fileType,
    book.dateAdded, book.lastOpenedAt, book.currentPage, book.totalPages, book.readingProgress,
    book.isFavorite ? 1 : 0, book.status, book.author, book.description, book.genre, book.series, book.volumeNumber, book.language, book.coverPath, book.updatedAt] as const;
}

const INSERT_SQL = `INSERT OR IGNORE INTO books
  (id,title,original_file_name,file_path,file_size,content_hash,file_type,date_added,last_opened_at,current_page,total_pages,reading_progress,is_favorite,status,author,description,genre,series,volume_number,language,cover_path,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function getAllBooks(): Promise<Book[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM books ORDER BY date_added DESC, id');
  return rows.map(fromRow);
}

export async function getBookById(id: string): Promise<Book | null> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM books WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function insertBook(input: NewBook): Promise<Book> {
  const now = new Date().toISOString();
  const book: Book = {
    lastOpenedAt: null, currentPage: 1, totalPages: null, readingProgress: 0, readingState: 'pending', isFavorite: false,
    status: 'available', author: null, description: null, genre: null, series: null, volumeNumber: null, language: null, coverPath: null, contentHash: null, readingTimeSeconds: 0, ...input, fileType: 'pdf', updatedAt: input.updatedAt ?? now,
  };
  const db = await database();
  await db.runAsync(INSERT_SQL, ...values(book));
  const existing = await getBookById(book.id);
  if (!existing) throw new Error('Book insert did not create a record.');
  return existing;
}

export async function getBookByContentHash(hash: string): Promise<Book | null> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM books WHERE content_hash = ?', hash);
  return row ? fromRow(row) : null;
}

export async function isFilePathReferenced(filePath: string, exceptId: string): Promise<boolean> {
  const db = await database();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM books WHERE file_path = ? AND id <> ? LIMIT 1', filePath, exceptId);
  return Boolean(row);
}

export async function updateBookContentHash(id: string, hash: string): Promise<void> {
  const db = await database();
  await db.runAsync('UPDATE books SET content_hash = ?, updated_at = ? WHERE id = ? AND content_hash IS NULL', hash, new Date().toISOString(), id);
}

export async function updateBookMetadata(id: string, changes: Partial<Pick<Book, 'title' | 'author' | 'description' | 'genre' | 'series' | 'volumeNumber' | 'language' | 'coverPath' | 'hideCoverDetails' | 'isFavorite' | 'status'>>): Promise<Book | null> {
  const current = await getBookById(id);
  if (!current) return null;
  const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
  const db = await database();
  await db.runAsync('UPDATE books SET title=?, author=?, description=?, genre=?, series=?, volume_number=?, language=?, cover_path=?, hide_cover_details=?, is_favorite=?, status=?, updated_at=? WHERE id=?',
    next.title, next.author, next.description, next.genre, next.series, next.volumeNumber, next.language, next.coverPath, next.hideCoverDetails ? 1 : 0, next.isFavorite ? 1 : 0, next.status, next.updatedAt, id);
  return next;
}

export async function deleteBook(id: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

export async function updateReadingProgress(id: string, currentPage: number, totalPages: number | null): Promise<void> {
  const page = Math.max(1, Math.floor(currentPage));
  const total = totalPages && totalPages > 0 ? Math.floor(totalPages) : null;
  const normalizedPage = total ? Math.min(page, total) : page;
  const progress = total ? normalizedPage / total : 0;
  const db = await database();
  await db.runAsync('UPDATE books SET current_page=?, total_pages=?, reading_progress=?, updated_at=? WHERE id=? AND (current_page<>? OR total_pages IS NOT ?)', normalizedPage, total, progress, new Date().toISOString(), id, normalizedPage, total);
}

export async function updateCurrentPage(id: string, page: number): Promise<void> {
  const book = await getBookById(id);
  if (book) await updateReadingProgress(id, page, book.totalPages);
}

export async function setBookFavorite(id: string, isFavorite: boolean): Promise<void> {
  await updateBookMetadata(id, { isFavorite });
}

export async function updateLastOpenedAt(id: string, date = new Date().toISOString()): Promise<void> {
  const db = await database();
  await db.runAsync('UPDATE books SET last_opened_at=?, updated_at=? WHERE id=?', date, date, id);
}

/** Adds elapsed active reading seconds to a book's persisted total. */
export async function addBookReadingTime(id: string, seconds: number): Promise<void> {
  const delta = Math.floor(seconds);
  if (delta <= 0) return;
  const db = await database();
  await db.runAsync(
    'UPDATE books SET reading_time_seconds = COALESCE(reading_time_seconds, 0) + ?, updated_at = ? WHERE id = ?',
    delta, new Date().toISOString(), id,
  );
}

export async function migrateLegacyCatalog(
  readLegacy: () => Promise<{ documents: LegacyDocument[]; corrupted: boolean }>,
  resolveFilePath: (document: LegacyDocument) => string | null,
): Promise<void> {
  const db = await database();
  const migration = await db.getFirstAsync<{ migration_id: string }>('SELECT migration_id FROM schema_migrations WHERE migration_id=?', CATALOG_MIGRATION);
  if (migration) return;
  const catalog = await readLegacy();
  let unresolvedFile = false;
  await db.withTransactionAsync(async () => {
    for (const legacy of catalog.documents) {
      const filePath = resolveFilePath(legacy);
      if (!filePath) {
        unresolvedFile = true;
        continue;
      }
      const book: Book = {
        id: legacy.id, title: legacy.originalName, originalFileName: legacy.originalName,
        filePath, fileSize: legacy.sizeBytes, contentHash: null, fileType: 'pdf', dateAdded: legacy.importedAt,
        lastOpenedAt: null, currentPage: 1, totalPages: null, readingProgress: 0, readingState: 'pending',
        isFavorite: false, status: 'available', author: null, description: null, genre: null, series: null, volumeNumber: null, language: null, coverPath: null, readingTimeSeconds: 0, updatedAt: legacy.importedAt,
      };
      await db.runAsync(INSERT_SQL, ...values(book));
    }
    // Keep retrying a corrupt/partially valid source on later starts. Valid rows use INSERT OR IGNORE.
    if (!catalog.corrupted && !unresolvedFile) await db.runAsync('INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?,?)', CATALOG_MIGRATION, new Date().toISOString());
  });
}
