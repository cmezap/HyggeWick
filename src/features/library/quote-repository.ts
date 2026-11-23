import * as SQLite from 'expo-sqlite';

export type FavoriteQuote = {
  id: string;
  bookId: string;
  text: string;
  page: number | null;
  note: string | null;
  createdAt: string;
};

export type NewFavoriteQuote = Pick<FavoriteQuote, 'bookId' | 'text'> &
  Partial<Pick<FavoriteQuote, 'page' | 'note'>>;

const DATABASE_NAME = 'hyggewick.db';
const QUOTES_MIGRATION = 'favorite_quotes_v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          migration_id TEXT PRIMARY KEY NOT NULL,
          completed_at TEXT NOT NULL
        );
      `);
      const migration = await db.getFirstAsync<{ migration_id: string }>(
        'SELECT migration_id FROM schema_migrations WHERE migration_id = ?', QUOTES_MIGRATION,
      );
      if (!migration) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS favorite_quotes (
              id TEXT PRIMARY KEY NOT NULL,
              book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
              quote_text TEXT NOT NULL CHECK (length(trim(quote_text)) > 0),
              page INTEGER CHECK (page IS NULL OR page >= 1),
              note TEXT,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS favorite_quotes_book_created_idx
              ON favorite_quotes(book_id, created_at DESC);
          `);
          await db.runAsync(
            'INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?, ?)',
            QUOTES_MIGRATION, new Date().toISOString(),
          );
        });
      }
      return db;
    })().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function fromRow(row: Record<string, unknown>): FavoriteQuote {
  return {
    id: String(row.id),
    bookId: String(row.book_id),
    text: String(row.quote_text),
    page: row.page == null ? null : Number(row.page),
    note: row.note == null ? null : String(row.note),
    createdAt: String(row.created_at),
  };
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getFavoriteQuotes(bookId: string): Promise<FavoriteQuote[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM favorite_quotes WHERE book_id = ? ORDER BY created_at DESC, id DESC', bookId,
  );
  return rows.map(fromRow);
}

export async function addFavoriteQuote(input: NewFavoriteQuote): Promise<FavoriteQuote> {
  const text = input.text.trim();
  if (!text) throw new Error('La frase no puede estar vacía.');
  const page = input.page == null ? null : Math.max(1, Math.floor(input.page));
  const quote: FavoriteQuote = {
    id: createId(), bookId: input.bookId, text, page,
    note: input.note?.trim() || null, createdAt: new Date().toISOString(),
  };
  const db = await database();
  await db.runAsync(
    'INSERT INTO favorite_quotes (id, book_id, quote_text, page, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    quote.id, quote.bookId, quote.text, quote.page, quote.note, quote.createdAt,
  );
  return quote;
}

export async function deleteFavoriteQuote(id: string, bookId: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM favorite_quotes WHERE id = ? AND book_id = ?', id, bookId);
}
