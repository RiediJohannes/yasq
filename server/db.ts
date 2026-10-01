import dotenv from 'dotenv';
import pkg from 'pg';

import type { Leaderboard } from './src/models/leaderboard.js';

const { Pool } = pkg;

dotenv.config({ path: '../.env' });

export const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function getClient() {
  if (!pool) {
    console.warn('Database not configured (DATABASE_URL missing).');
    return null;
  }
  try {
    return await pool.connect();
  } catch (error: any) {
    console.warn('Failed to connect to database. Error:', error.message);
    return null;
  }
}

export async function initDatabase() {
  if (!pool) {
    console.warn('Database not configured (DATABASE_URL missing). Skipping initDatabase.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      game_id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entries (
      entry_id SERIAL PRIMARY KEY,
      game_id INT REFERENCES games(game_id) ON DELETE CASCADE,
      user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE CASCADE,
      total_score INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      round_id SERIAL PRIMARY KEY,
      entry_id INT REFERENCES entries(entry_id) ON DELETE CASCADE,
      round_num INT NOT NULL,
      guess VARCHAR(255) NOT NULL,
      points INT NOT NULL,
      score_value NUMERIC(3,2) NOT NULL,
      is_first BOOLEAN NOT NULL,
      time_taken VARCHAR(32) NOT NULL
    );
  `);
}

export async function saveLeaderboard(leaderboard: Leaderboard): Promise<void> {
  const client = await getClient();
  if (!client) return;

  try {
    await client.query('BEGIN');

    // 1. Create a game session record in the `games` table
    const gameResult = await client.query(`INSERT INTO games DEFAULT VALUES RETURNING game_id`);
    const gameId = gameResult.rows[0].game_id;

    for (const entry of leaderboard.getAll()) {
      // 2. Ensure the user exists in the `users` table
      await client.query(`INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [entry.userId]);

      // 3. Insert the player's entry into the `entries` table
      const entryResult = await client.query(
        `INSERT INTO entries (game_id, user_id, total_score) VALUES ($1, $2, $3) RETURNING entry_id`,
        [gameId, entry.userId, entry.totalScore]
      );
      const entryId = entryResult.rows[0].entry_id;

      // 4. Insert each round from the entry's roundHistory into the `rounds` table
      for (const r of entry.roundHistory) {
        await client.query(
          `INSERT INTO rounds (entry_id, round_num, guess, points, score_value, is_first, time_taken)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [entryId, r.round, r.guess ?? 'No guess submitted', r.points ?? 0, r.scoreValue, r.isFirst, r.time ?? '30.0']
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to save leaderboard data:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlayerRank(userId: string) {
  const client = await getClient();
  if (!client) return null;

  try {
    const query = `
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
      WHERE user_id = $1;
    `;
    const result = await client.query(query, [userId]);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function getTopLifetimePlayers(limit: number = 5) {
  const client = await getClient();
  if (!client) return null;

  try {
    const query = `
      SELECT
        user_id,
        SUM(total_score) AS lifetime_points,
        COUNT(game_id) AS games_played,
        RANK() OVER (ORDER BY SUM(total_score) DESC) AS rank
      FROM entries
      GROUP BY user_id
      ORDER BY lifetime_points DESC
      LIMIT $1;
    `;
    const result = await client.query(query, [limit]);
    return result.rows;
  } finally {
    client.release();
  }
}
