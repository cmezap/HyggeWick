import type { FitMode } from '@kishannareshpal/expo-pdf';
import * as SQLite from 'expo-sqlite';

export type ReaderColorMode = 'day' | 'night' | 'night_contrast' | 'sepia' | 'grayscale';
export type ReaderPaddingPreset = 'none' | 'compact' | 'moderate';

export type ReaderPreferences = {
  horizontal: boolean;
  pageGapEnabled: boolean;
  paddingPreset: ReaderPaddingPreset;
  colorMode: ReaderColorMode;
  fitMode: FitMode;
  continuousHighlight: boolean;
  keepAwake: boolean;
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  horizontal: false,
  pageGapEnabled: true,
  paddingPreset: 'compact',
  colorMode: 'day',
  fitMode: 'width',
  continuousHighlight: true,
  keepAwake: false,
};

const DATABASE_NAME = 'hyggewick.db';
const PREFERENCES_MIGRATION = 'reader_preferences_v1';
const PREFERENCES_KEY = 'default';
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
          CREATE TABLE IF NOT EXISTS reader_preferences (
            id TEXT PRIMARY KEY NOT NULL,
            horizontal INTEGER NOT NULL DEFAULT 0,
            page_gap_enabled INTEGER NOT NULL DEFAULT 1,
            padding_preset TEXT NOT NULL DEFAULT 'compact',
            color_mode TEXT NOT NULL DEFAULT 'day',
            fit_mode TEXT NOT NULL DEFAULT 'width',
            continuous_highlight INTEGER NOT NULL DEFAULT 1,
            keep_awake INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
          );
        `);
        await db.runAsync(
          'INSERT OR IGNORE INTO schema_migrations (migration_id, completed_at) VALUES (?, ?)',
          PREFERENCES_MIGRATION, new Date().toISOString(),
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

function parseColorMode(value: unknown): ReaderColorMode {
  return value === 'night' || value === 'night_contrast' || value === 'sepia' || value === 'grayscale' ? value : 'day';
}

function parsePaddingPreset(value: unknown): ReaderPaddingPreset {
  return value === 'none' || value === 'moderate' ? value : 'compact';
}

function parseFitMode(value: unknown): FitMode {
  return value === 'height' || value === 'both' ? value : 'width';
}

export async function getReaderPreferences(): Promise<ReaderPreferences> {
  const db = await database();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM reader_preferences WHERE id = ?',
    PREFERENCES_KEY,
  );
  if (!row) return DEFAULT_READER_PREFERENCES;
  return {
    horizontal: Number(row.horizontal) === 1,
    pageGapEnabled: Number(row.page_gap_enabled) !== 0,
    paddingPreset: parsePaddingPreset(row.padding_preset),
    colorMode: parseColorMode(row.color_mode),
    fitMode: parseFitMode(row.fit_mode),
    continuousHighlight: Number(row.continuous_highlight) !== 0,
    keepAwake: Number(row.keep_awake) === 1,
  };
}

export async function saveReaderPreferences(next: ReaderPreferences): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO reader_preferences (
      id, horizontal, page_gap_enabled, padding_preset, color_mode, fit_mode, continuous_highlight, keep_awake, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      horizontal = excluded.horizontal,
      page_gap_enabled = excluded.page_gap_enabled,
      padding_preset = excluded.padding_preset,
      color_mode = excluded.color_mode,
      fit_mode = excluded.fit_mode,
      continuous_highlight = excluded.continuous_highlight,
      keep_awake = excluded.keep_awake,
      updated_at = excluded.updated_at`,
    PREFERENCES_KEY,
    next.horizontal ? 1 : 0,
    next.pageGapEnabled ? 1 : 0,
    next.paddingPreset,
    next.colorMode,
    next.fitMode,
    next.continuousHighlight ? 1 : 0,
    next.keepAwake ? 1 : 0,
    new Date().toISOString(),
  );
}
