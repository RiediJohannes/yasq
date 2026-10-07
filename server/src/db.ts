import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import dotenv from 'dotenv';

import type { Leaderboard } from './models/leaderboard.js';
import { DATABASE_DIR } from '@yasq/shared';

dotenv.config({ path: '../.env' });

let dbInstance: Database.Database | null = null;

/** Open the database or return null (with a warning) if unconfigured or unopenable. */
export function openDatabase(): Database.Database | null {
  if (dbInstance) return dbInstance;

  const filePath = process.env.DATABASE_PATH;
  if (!filePath) return null;

  const fullPath = filePath === ':memory:' ? filePath : join(DATABASE_DIR, filePath);

  try {
    if (fullPath !== ':memory:') mkdirSync(dirname(fullPath), { recursive: true });
    dbInstance = new Database(fullPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    return dbInstance;
  } catch (error: any) {
    console.warn('Failed to open database. Error:', error.message);
    return null;
  }
}

function getDb(): Database.Database | null {
  return openDatabase();
}

export async function initDatabase() {
  const conn = getDb();
  if (!conn) {
    console.warn('Database not configured (DATABASE_PATH missing or unusable). Skipping initDatabase.');
    return;
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      game_id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entries (
      entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER REFERENCES games(game_id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
      total_score INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      round_id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER REFERENCES entries(entry_id) ON DELETE CASCADE,
      round_num INTEGER NOT NULL,
      guess TEXT NOT NULL,
      points INTEGER NOT NULL,
      score_value REAL NOT NULL,
      is_first INTEGER NOT NULL,
      time_taken TEXT NOT NULL
    );
  `);
}

export async function saveLeaderboard(leaderboard: Leaderboard): Promise<void> {
  const conn = getDb();
  if (!conn) return;

  const insertGame = conn.prepare(`INSERT INTO games DEFAULT VALUES RETURNING game_id`);
  const insertUser = conn.prepare(`INSERT INTO users (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING`);
  const insertEntry = conn.prepare(
    `INSERT INTO entries (game_id, user_id, total_score) VALUES (?, ?, ?) RETURNING entry_id`
  );
  const insertRound = conn.prepare(
    `INSERT INTO rounds (entry_id, round_num, guess, points, score_value, is_first, time_taken)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  // BEGIN/COMMIT automatically; ROLLBACK and rethrow if the callback throws
  const save = conn.transaction(() => {
    // 1. Create a game session record in the `games` table
    const { game_id: gameId } = insertGame.get() as { game_id: number };

    for (const entry of leaderboard.getAll()) {
      // 2. Ensure the user exists in the `users` table
      insertUser.run(entry.userId);

      // 3. Insert the player's entry into the `entries` table
      const { entry_id: entryId } = insertEntry.get(gameId, entry.userId, entry.totalScore) as {
        entry_id: number;
      };

      // 4. Insert each round from the entry's roundHistory into the `rounds` table
      for (const r of entry.roundHistory) {
        insertRound.run(
          entryId,
          r.round,
          r.guess ?? 'No guess submitted',
          r.points ?? 0,
          r.scoreValue,
          r.isFirst ? 1 : 0, // better-sqlite3 refuses to bind JS booleans
          r.time ?? '30.0'
        );
      }
    }
  });

  try {
    save();
  } catch (error) {
    console.error('Failed to save leaderboard data:', error);
    throw error;
  }
}

export interface PlayerRank {
  user_id: string;
  lifetime_points: number;
  games_played: number;
  rank: number;
}

export async function getPlayerRank(userId: string): Promise<PlayerRank | null> {
  const conn = getDb();
  if (!conn) return null;

  const row = conn
    .prepare(
      `
      WITH lifetime_leaderboard AS (
        SELECT
          user_id,
          SUM(total_score) AS lifetime_points,
          COUNT(game_id) AS games_played,
          RANK() OVER (ORDER BY SUM(total_score) DESC) AS rank
        FROM entries
        GROUP BY user_id
      )
      SELECT *
      FROM lifetime_leaderboard
      WHERE user_id = ?;
    `
    )
    .get(userId) as PlayerRank | undefined;

  return row ?? null;
}

export async function getTopLifetimePlayers(limit: number = 5): Promise<PlayerRank[] | null> {
  const conn = getDb();
  if (!conn) return null;

  return conn
    .prepare(
      `
      SELECT
        user_id,
        SUM(total_score) AS lifetime_points,
        COUNT(game_id) AS games_played,
        RANK() OVER (ORDER BY SUM(total_score) DESC) AS rank
      FROM entries
      GROUP BY user_id
      ORDER BY lifetime_points DESC
      LIMIT ?;
    `
    )
    .all(limit) as PlayerRank[];
}

/** Close the database gracefully */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
