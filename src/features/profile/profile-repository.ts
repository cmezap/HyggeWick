import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { calculateBestStreak, calculateCurrentStreak, localDateKey } from './reading-streak';

const DATABASE_NAME = 'hyggewick.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

export type ReaderProfile = {
  name: string;
  tagline: string;
  avatarUri: string | null;
  bestStreak: number;
  bestStreakDate: string | null;
};

export type ReadingActivitySummary = {
  activeDays: string[];
  pagesRead: number;
  currentStreak: number;
  bestStreak: number;
  bestStreakDate: string | null;
};

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS reader_profile (
          profile_id INTEGER PRIMARY KEY CHECK (profile_id = 1),
          name TEXT NOT NULL DEFAULT '',
          tagline TEXT NOT NULL DEFAULT '',
          avatar_uri TEXT,
          best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
          best_streak_date TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reading_activity_days (
          activity_date TEXT PRIMARY KEY NOT NULL,
          first_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reading_page_visits (
          book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          page INTEGER NOT NULL CHECK (page >= 1),
          activity_date TEXT NOT NULL REFERENCES reading_activity_days(activity_date) ON DELETE CASCADE,
          PRIMARY KEY (book_id, page)
        );
        CREATE INDEX IF NOT EXISTS reading_activity_days_date_idx ON reading_activity_days(activity_date DESC);
      `);
      await db.runAsync(
        'INSERT OR IGNORE INTO reader_profile (profile_id, name, tagline, updated_at) VALUES (1, ?, ?, ?)',
        '', '', new Date().toISOString(),
      );
      return db;
    })().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function profileFromRow(row: Record<string, unknown>): ReaderProfile {
  return {
    name: String(row.name ?? ''),
    tagline: String(row.tagline ?? ''),
    avatarUri: row.avatar_uri == null ? null : String(row.avatar_uri),
    bestStreak: Number(row.best_streak ?? 0),
    bestStreakDate: row.best_streak_date == null ? null : String(row.best_streak_date),
  };
}

export async function getReaderProfile(): Promise<ReaderProfile> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM reader_profile WHERE profile_id = 1');
  if (!row) throw new Error('No se pudo cargar el perfil del lector.');
  return profileFromRow(row);
}

export async function saveReaderProfile(changes: Pick<ReaderProfile, 'name' | 'tagline'>): Promise<ReaderProfile> {
  const name = changes.name.trim().slice(0, 48);
  const tagline = changes.tagline.trim().slice(0, 100);
  const db = await database();
  await db.runAsync('UPDATE reader_profile SET name = ?, tagline = ?, updated_at = ? WHERE profile_id = 1', name, tagline, new Date().toISOString());
  return getReaderProfile();
}

const avatarDirectory = new Directory(Paths.document, 'hyggewick-profile');
export async function storeProfileAvatar(sourceUri: string, fileName: string) {
  if (!avatarDirectory.exists) avatarDirectory.create({ intermediates: true });
  const extension = /\.(jpe?g|png|webp|gif|heic)$/i.exec(fileName)?.[0]?.toLowerCase() ?? '.img';
  const destination = new File(avatarDirectory, `avatar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${extension}`);
  await LegacyFileSystem.copyAsync({ from: sourceUri, to: destination.uri });
  if (!destination.exists || destination.size <= 0) {
    if (destination.exists) destination.delete();
    throw new Error('No se pudo guardar la imagen elegida.');
  }
  const db = await database();
  const previous = await db.getFirstAsync<{ avatar_uri: string | null }>('SELECT avatar_uri FROM reader_profile WHERE profile_id = 1');
  await db.runAsync('UPDATE reader_profile SET avatar_uri = ?, updated_at = ? WHERE profile_id = 1', destination.uri, new Date().toISOString());
  if (previous?.avatar_uri?.startsWith(avatarDirectory.uri)) {
    try { const oldFile = new File(previous.avatar_uri); if (oldFile.exists) oldFile.delete(); } catch { /* Keep a profile update if old media cleanup fails. */ }
  }
  return destination.uri;
}

export async function recordReadingActivity(bookId: string, pages: readonly number[]) {
  const day = localDateKey();
  const validPages = [...new Set(pages.filter((page) => Number.isInteger(page) && page >= 1))];
  if (validPages.length === 0) return;
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT OR IGNORE INTO reading_activity_days (activity_date, first_seen_at) VALUES (?, ?)', day, new Date().toISOString());
    for (const page of validPages) {
      await db.runAsync('INSERT OR IGNORE INTO reading_page_visits (book_id, page, activity_date) VALUES (?, ?, ?)', bookId, page, day);
    }
    const dayRows = await db.getAllAsync<{ activity_date: string }>('SELECT activity_date FROM reading_activity_days ORDER BY activity_date');
    const dates = dayRows.map((row) => row.activity_date);
    const best = calculateBestStreak(dates);
    const profile = await db.getFirstAsync<{ best_streak: number }>('SELECT best_streak FROM reader_profile WHERE profile_id = 1');
    if (best.length > Number(profile?.best_streak ?? 0)) {
      await db.runAsync('UPDATE reader_profile SET best_streak = ?, best_streak_date = ?, updated_at = ? WHERE profile_id = 1', best.length, best.endDate, new Date().toISOString());
    }
  });
}

export async function getReadingActivitySummary(): Promise<ReadingActivitySummary> {
  const db = await database();
  const [dayRows, countRow, profileRow] = await Promise.all([
    db.getAllAsync<{ activity_date: string }>('SELECT activity_date FROM reading_activity_days ORDER BY activity_date DESC LIMIT 3660'),
    db.getFirstAsync<{ pages_read: number }>('SELECT COUNT(*) AS pages_read FROM reading_page_visits'),
    db.getFirstAsync<Record<string, unknown>>('SELECT * FROM reader_profile WHERE profile_id = 1'),
  ]);
  const activeDays = dayRows.map((row) => row.activity_date);
  const profile = profileRow ? profileFromRow(profileRow) : { name: '', tagline: '', avatarUri: null, bestStreak: 0, bestStreakDate: null };
  return {
    activeDays,
    pagesRead: Number(countRow?.pages_read ?? 0),
    currentStreak: calculateCurrentStreak(activeDays),
    bestStreak: profile.bestStreak,
    bestStreakDate: profile.bestStreakDate,
  };
}

export function todayLocalDate() { return localDateKey(); }
