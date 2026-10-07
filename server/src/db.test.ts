import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import {
  initDatabase,
  saveLeaderboard,
  getPlayerRank,
  getTopLifetimePlayers,
  openDatabase,
  closeDatabase,
} from './db.js';

let db: Database.Database;

beforeEach(async () => {
  process.env.DATABASE_PATH = ':memory:';
  closeDatabase();
  db = openDatabase()!;
  await initDatabase();
});

afterEach(() => {
  closeDatabase();
});

const mockLeaderboard = {
  getAll: () => [
    { userId: 'user_1', totalScore: 150, roundHistory: [] },
    { userId: 'user_2', totalScore: 80, roundHistory: [] },
  ],
};

const mockLeaderboard2 = {
  getAll: () => [
    { userId: 'user_1', totalScore: 170, roundHistory: [] },
    { userId: 'user_3', totalScore: 120, roundHistory: [] },
  ],
};

describe('initDatabase', () => {
  it('should create all required tables successfully', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('games');
    expect(tableNames).toContain('entries');
    expect(tableNames).toContain('rounds');
  });
});

describe('getPlayerRank', () => {
  it('should correctly compute player rankings', async () => {
    await saveLeaderboard(mockLeaderboard as any);
    await saveLeaderboard(mockLeaderboard2 as any);

    const rank1 = await getPlayerRank('user_1');
    expect(rank1).not.toBeNull();
    expect(rank1?.lifetime_points).toBe(320);
    expect(rank1?.games_played).toBe(2);
    expect(rank1?.rank).toBe(1);

    const rank2 = await getPlayerRank('user_3');
    expect(rank2).not.toBeNull();
    expect(rank2?.lifetime_points).toBe(120);
    expect(rank2?.games_played).toBe(1);
    expect(rank2?.rank).toBe(2);

    const rank3 = await getPlayerRank('user_2');
    expect(rank3).not.toBeNull();
    expect(rank3?.lifetime_points).toBe(80);
    expect(rank3?.games_played).toBe(1);
    expect(rank3?.rank).toBe(3);
  });

  it('should return null for non-existent player rank lookups', async () => {
    const rank = await getPlayerRank('non_existent_user');
    expect(rank).toBeNull();
  });
});

describe('getTopLifetimePlayers', () => {
  it('should return top players ordered by lifetime points with limit applied', async () => {
    await saveLeaderboard(mockLeaderboard as any);
    await saveLeaderboard(mockLeaderboard2 as any);

    const topPlayers = await getTopLifetimePlayers(2);
    expect(topPlayers).not.toBeNull();
    expect(topPlayers?.length).toBe(2);
    expect(topPlayers?.[0]?.user_id).toBe('user_1');
    expect(topPlayers?.[0]?.lifetime_points).toBe(320);
    expect(topPlayers?.[1]?.user_id).toBe('user_3');
    expect(topPlayers?.[1]?.lifetime_points).toBe(120);
  });
});
