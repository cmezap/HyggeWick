import * as SQLite from 'expo-sqlite';

export type ReadingNote = {
  id: string;
  bookId: string;
  page: number;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type NewReadingNote = Pick<ReadingNote, 'bookId' | 'page' | 'content'> & Partial<Pick<ReadingNote, 'title'>>;
export type ReadingNoteChanges = Pick<ReadingNote, 'title' | 'content'>;

const DATABASE_NAME = 'hyggewick.db';
const NOTES_MIGRATION = 'reading_notes_v1';
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
          CREATE TABLE IF NOT EXISTS reading_notes (
            id TEXT PRIMARY KEY NOT NULL,
            book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            page INTEGER NOT NULL CHECK (page >= 1),
            title TEXT,
            content TEXT NOT NULL CHECK (length(trim(content)) > 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS reading_notes_book_updated_idx
            ON reading_notes(book_id, updated_at DESC);
          CREATE INDEX IF NOT EXISTS reading_notes_book_page_idx
            ON reading_notes(book_id, page);
        `);
        await db.runAsync(
          'INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?, ?)',
          NOTES_MIGRATION, new Date().toISOString(),
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

function fromRow(row: Record<string, unknown>): ReadingNote {
  return {
    id: String(row.id), bookId: String(row.book_id), page: Number(row.page),
    title: row.title == null ? null : String(row.title), content: String(row.content),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizePage(page: number) {
  if (!Number.isInteger(page) || page < 1) throw new Error('El número de página no es válido.');
  return page;
}

async function getNoteById(id: string, bookId: string): Promise<ReadingNote | null> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM reading_notes WHERE id = ? AND book_id = ?', id, bookId,
  );
  return row ? fromRow(row) : null;
}

export async function getReadingNotes(bookId: string): Promise<ReadingNote[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM reading_notes WHERE book_id = ? ORDER BY updated_at DESC, id DESC', bookId,
  );
  return rows.map(fromRow);
}

export async function getReadingNotesAtPage(bookId: string, page: number): Promise<ReadingNote[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM reading_notes WHERE book_id = ? AND page = ? ORDER BY updated_at DESC, id DESC',
    bookId, normalizePage(page),
  );
  return rows.map(fromRow);
}

export async function createReadingNote(input: NewReadingNote): Promise<ReadingNote> {
  const page = normalizePage(input.page);
  const title = input.title?.trim() || null;
  const content = input.content.trim();
  if (!content) throw new Error('La nota no puede estar vacía.');
  const now = new Date().toISOString();
  const id = createId();
  const db = await database();
  await db.runAsync(
    'INSERT INTO reading_notes (id, book_id, page, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, input.bookId, page, title, content, now, now,
  );
  const note = await getNoteById(id, input.bookId);
  if (!note) throw new Error('No se pudo guardar la nota.');
  return note;
}

export async function updateReadingNote(id: string, bookId: string, changes: ReadingNoteChanges): Promise<ReadingNote> {
  const title = changes.title?.trim() || null;
  const content = changes.content.trim();
  if (!content) throw new Error('La nota no puede estar vacía.');
  const existing = await getNoteById(id, bookId);
  if (!existing) throw new Error('No se encontró la nota que quieres editar.');
  const previousUpdate = Date.parse(existing.updatedAt);
  const updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previousUpdate) ? previousUpdate + 1 : 0)).toISOString();
  const db = await database();
  const result = await db.runAsync(
    'UPDATE reading_notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND book_id = ?',
    title, content, updatedAt, id, bookId,
  );
  if (result.changes === 0) throw new Error('No se encontró la nota que quieres editar.');
  const note = await getNoteById(id, bookId);
  if (!note) throw new Error('No se pudo recuperar la nota actualizada.');
  return note;
}

export async function deleteReadingNote(id: string, bookId: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM reading_notes WHERE id = ? AND book_id = ?', id, bookId);
}
