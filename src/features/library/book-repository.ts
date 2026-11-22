import * as SQLite from 'expo-sqlite';

export type BookStatus = 'available' | 'missing';
export type Book = {
  id: string;
  title: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  fileType: 'pdf';
  dateAdded: string;
  lastOpenedAt: string | null;
  currentPage: number;
  totalPages: number | null;
  readingProgress: number;
  isFavorite: boolean;
  status: BookStatus;
  author: string | null;
  coverPath: string | null;
  updatedAt: string;
};

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
          file_type TEXT NOT NULL DEFAULT 'pdf' CHECK (file_type = 'pdf'),
          date_added TEXT NOT NULL,
          last_opened_at TEXT,
          current_page INTEGER NOT NULL DEFAULT 1 CHECK (current_page >= 1),
          total_pages INTEGER CHECK (total_pages IS NULL OR total_pages >= 1),
          reading_progress REAL NOT NULL DEFAULT 0 CHECK (reading_progress >= 0 AND reading_progress <= 1),
          is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
          status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'missing')),
          author TEXT,
          cover_path TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS books_date_added_idx ON books(date_added DESC);
        CREATE TABLE IF NOT EXISTS schema_migrations (
          migration_id TEXT PRIMARY KEY NOT NULL,
          completed_at TEXT NOT NULL
        );
      `);
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
    filePath: String(row.file_path), fileSize: Number(row.file_size), fileType: 'pdf',
    dateAdded: String(row.date_added), lastOpenedAt: row.last_opened_at == null ? null : String(row.last_opened_at),
    currentPage: Number(row.current_page), totalPages: row.total_pages == null ? null : Number(row.total_pages),
    readingProgress: Number(row.reading_progress), isFavorite: Number(row.is_favorite) === 1,
    status: row.status === 'missing' ? 'missing' : 'available', author: row.author == null ? null : String(row.author),
    coverPath: row.cover_path == null ? null : String(row.cover_path), updatedAt: String(row.updated_at),
  };
}

function values(book: Book) {
  return [book.id, book.title, book.originalFileName, book.filePath, book.fileSize, book.fileType,
    book.dateAdded, book.lastOpenedAt, book.currentPage, book.totalPages, book.readingProgress,
    book.isFavorite ? 1 : 0, book.status, book.author, book.coverPath, book.updatedAt] as const;
}

const INSERT_SQL = `INSERT OR IGNORE INTO books
  (id,title,original_file_name,file_path,file_size,file_type,date_added,last_opened_at,current_page,total_pages,reading_progress,is_favorite,status,author,cover_path,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

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
    lastOpenedAt: null, currentPage: 1, totalPages: null, readingProgress: 0, isFavorite: false,
    status: 'available', author: null, coverPath: null, ...input, fileType: 'pdf', updatedAt: input.updatedAt ?? now,
  };
  const db = await database();
  await db.runAsync(INSERT_SQL, ...values(book));
  const existing = await getBookById(book.id);
  if (!existing) throw new Error('Book insert did not create a record.');
  return existing;
}

export async function updateBookMetadata(id: string, changes: Partial<Pick<Book, 'title' | 'author' | 'coverPath' | 'isFavorite' | 'status'>>): Promise<Book | null> {
  const current = await getBookById(id);
  if (!current) return null;
  const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
  const db = await database();
  await db.runAsync('UPDATE books SET title=?, author=?, cover_path=?, is_favorite=?, status=?, updated_at=? WHERE id=?',
    next.title, next.author, next.coverPath, next.isFavorite ? 1 : 0, next.status, next.updatedAt, id);
  return next;
}

export async function deleteBook(id: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

export async function updateReadingProgress(id: string, currentPage: number, totalPages: number | null): Promise<void> {
  const page = Math.max(1, Math.floor(currentPage));
  const total = totalPages && totalPages > 0 ? Math.floor(totalPages) : null;
  const progress = total ? Math.min(1, page / total) : 0;
  const db = await database();
  await db.runAsync('UPDATE books SET current_page=?, total_pages=?, reading_progress=?, updated_at=? WHERE id=?', page, total, progress, new Date().toISOString(), id);
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
        filePath, fileSize: legacy.sizeBytes, fileType: 'pdf', dateAdded: legacy.importedAt,
        lastOpenedAt: null, currentPage: 1, totalPages: null, readingProgress: 0,
        isFavorite: false, status: 'available', author: null, coverPath: null, updatedAt: legacy.importedAt,
      };
      await db.runAsync(INSERT_SQL, ...values(book));
    }
    // Keep retrying a corrupt/partially valid source on later starts. Valid rows use INSERT OR IGNORE.
    if (!catalog.corrupted && !unresolvedFile) await db.runAsync('INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?,?)', CATALOG_MIGRATION, new Date().toISOString());
  });
}
