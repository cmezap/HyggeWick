import * as SQLite from 'expo-sqlite';

export type ReadingBookmark = {
  id: string;
  bookId: string;
  page: number;
  name: string;
  createdAt: string;
};

export type NewReadingBookmark = Pick<ReadingBookmark, 'bookId' | 'page'> & Partial<Pick<ReadingBookmark, 'name'>>;

const DATABASE_NAME = 'hyggewick.db';
const BOOKMARKS_MIGRATION = 'reading_bookmarks_v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY NOT NULL,
        completed_at TEXT NOT NULL
      );`);
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS reading_bookmarks (
            id TEXT PRIMARY KEY NOT NULL,
            book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            page INTEGER NOT NULL CHECK (page >= 1),
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            created_at TEXT NOT NULL,
            UNIQUE (book_id, page)
          );
          CREATE INDEX IF NOT EXISTS reading_bookmarks_book_created_idx
            ON reading_bookmarks(book_id, created_at DESC);
        `);
        await db.runAsync(
          'INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?, ?)',
          BOOKMARKS_MIGRATION, new Date().toISOString(),
        );
      });
      return db;
    })().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function fromRow(row: Record<string, unknown>): ReadingBookmark {
  return {
    id: String(row.id), bookId: String(row.book_id), page: Number(row.page),
    name: String(row.name), createdAt: String(row.created_at),
  };
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getReadingBookmarks(bookId: string): Promise<ReadingBookmark[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM reading_bookmarks WHERE book_id = ? ORDER BY created_at DESC, id DESC', bookId,
  );
  return rows.map(fromRow);
}

export async function getReadingBookmarkAtPage(bookId: string, page: number): Promise<ReadingBookmark | null> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM reading_bookmarks WHERE book_id = ? AND page = ?', bookId, normalizePage(page),
  );
  return row ? fromRow(row) : null;
}

export async function saveReadingBookmark(input: NewReadingBookmark, totalPages?: number | null): Promise<ReadingBookmark> {
  const page = normalizePage(input.page);
  if (totalPages != null && (!Number.isInteger(totalPages) || totalPages < 1 || page > totalPages)) {
    throw new Error('La página está fuera del rango del documento.');
  }
  const name = input.name?.trim() || `Página ${page}`;
  const createdAt = new Date().toISOString();
  const id = createId();
  const db = await database();
  await db.runAsync(`INSERT INTO reading_bookmarks (id, book_id, page, name, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(book_id, page) DO UPDATE SET name = excluded.name`, id, input.bookId, page, name, createdAt);
  const bookmark = await getReadingBookmarkAtPage(input.bookId, page);
  if (!bookmark) throw new Error('No se pudo guardar el marcador.');
  return bookmark;
}

export async function deleteReadingBookmark(id: string, bookId: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM reading_bookmarks WHERE id = ? AND book_id = ?', id, bookId);
}

function normalizePage(page: number) {
  if (!Number.isInteger(page) || page < 1) throw new Error('El número de página no es válido.');
  return page;
}
