import * as SQLite from 'expo-sqlite';

export type HighlightRect = { left: number; top: number; right: number; bottom: number };
export type ReadingHighlight = {
  id: string;
  bookId: string;
  page: number;
  text: string;
  startIndex: number;
  endIndex: number;
  rects: HighlightRect[];
  pageRotation: number;
  color: string;
  createdAt: string;
  updatedAt: string;
};
export type NewReadingHighlight = Pick<ReadingHighlight,
  'bookId' | 'page' | 'text' | 'startIndex' | 'endIndex' | 'rects' | 'pageRotation'> &
  Partial<Pick<ReadingHighlight, 'color'>>;

const DATABASE_NAME = 'hyggewick.db';
const HIGHLIGHTS_MIGRATION = 'reading_highlights_v1';
export const DEFAULT_HIGHLIGHT_COLOR = '#EBCB76';
export const HIGHLIGHT_COLORS = ['#EBCB76', '#A8CFA7', '#E7AFC3', '#D7AFE0'] as const;
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
          CREATE TABLE IF NOT EXISTS reading_highlights (
            id TEXT PRIMARY KEY NOT NULL,
            book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            page INTEGER NOT NULL CHECK (page >= 1),
            highlight_text TEXT NOT NULL CHECK (length(trim(highlight_text)) > 0),
            start_index INTEGER NOT NULL CHECK (start_index >= 0),
            end_index INTEGER NOT NULL CHECK (end_index > start_index),
            rects_json TEXT NOT NULL CHECK (json_valid(rects_json)),
            page_rotation INTEGER NOT NULL CHECK (page_rotation BETWEEN 0 AND 3),
            color TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (book_id, page, start_index, end_index)
          );
          CREATE INDEX IF NOT EXISTS reading_highlights_book_page_idx
            ON reading_highlights(book_id, page, created_at DESC);
        `);
        await db.runAsync(
          'INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?, ?)',
          HIGHLIGHTS_MIGRATION, new Date().toISOString(),
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

function fromRow(row: Record<string, unknown>): ReadingHighlight {
  return {
    id: String(row.id), bookId: String(row.book_id), page: Number(row.page),
    text: String(row.highlight_text), startIndex: Number(row.start_index), endIndex: Number(row.end_index),
    rects: JSON.parse(String(row.rects_json)) as HighlightRect[], pageRotation: Number(row.page_rotation),
    color: String(row.color), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function validate(input: NewReadingHighlight) {
  if (!input.bookId || !Number.isInteger(input.page) || input.page < 1) throw new Error('La página del highlight no es válida.');
  if (!input.text.trim() || !Number.isInteger(input.startIndex) || !Number.isInteger(input.endIndex) || input.startIndex < 0 || input.endIndex <= input.startIndex) {
    throw new Error('El texto seleccionado no es válido.');
  }
  if (!input.rects.length || input.rects.some((rect) =>
    ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) ||
    rect.left < 0 || rect.top < 0 || rect.right > 1 || rect.bottom > 1 || rect.right <= rect.left || rect.bottom <= rect.top,
  )) throw new Error('La geometría del highlight no es válida.');
  if (!Number.isInteger(input.pageRotation) || input.pageRotation < 0 || input.pageRotation > 3) throw new Error('La rotación de página no es válida.');
  const color = input.color ?? DEFAULT_HIGHLIGHT_COLOR;
  if (!/^#[0-9A-F]{6}$/i.test(color)) throw new Error('El color del highlight no es válido.');
}

export async function getReadingHighlights(bookId: string): Promise<ReadingHighlight[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM reading_highlights WHERE book_id = ? ORDER BY page ASC, created_at ASC, id ASC', bookId,
  );
  return rows.map(fromRow);
}

export async function getReadingHighlightsAtPage(bookId: string, page: number): Promise<ReadingHighlight[]> {
  if (!Number.isInteger(page) || page < 1) throw new Error('La página del highlight no es válida.');
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM reading_highlights WHERE book_id = ? AND page = ? ORDER BY created_at ASC, id ASC', bookId, page,
  );
  return rows.map(fromRow);
}

export async function saveReadingHighlight(input: NewReadingHighlight): Promise<ReadingHighlight> {
  validate(input);
  const color = input.color ?? DEFAULT_HIGHLIGHT_COLOR;
  const now = new Date().toISOString();
  const id = createId();
  const db = await database();
  await db.runAsync(`INSERT INTO reading_highlights
    (id, book_id, page, highlight_text, start_index, end_index, rects_json, page_rotation, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(book_id, page, start_index, end_index) DO UPDATE SET
      highlight_text = excluded.highlight_text,
      rects_json = excluded.rects_json,
      page_rotation = excluded.page_rotation,
      color = excluded.color,
      updated_at = excluded.updated_at`,
  id, input.bookId, input.page, input.text.trim(), input.startIndex, input.endIndex,
  JSON.stringify(input.rects), input.pageRotation, color, now, now);
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM reading_highlights WHERE book_id = ? AND page = ? AND start_index = ? AND end_index = ?',
    input.bookId, input.page, input.startIndex, input.endIndex,
  );
  if (!row) throw new Error('No se pudo recuperar el highlight guardado.');
  return fromRow(row);
}

export async function updateReadingHighlightColor(id: string, bookId: string, color: string): Promise<void> {
  if (!/^#[0-9A-F]{6}$/i.test(color)) throw new Error('El color del highlight no es válido.');
  const db = await database();
  const result = await db.runAsync(
    'UPDATE reading_highlights SET color = ?, updated_at = ? WHERE id = ? AND book_id = ?',
    color, new Date().toISOString(), id, bookId,
  );
  if (result.changes === 0) throw new Error('No se encontró el highlight.');
}

export async function deleteReadingHighlight(id: string, bookId: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM reading_highlights WHERE id = ? AND book_id = ?', id, bookId);
}
