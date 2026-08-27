import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { generateResultsImage } from './export_results.js';
import type { Participant } from '@yasq/shared';
import { setupTempDir } from './helper.js';
import { Leaderboard } from './models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockUserData = new Map<string, Participant>([
  ['1', { id: '1', username: 'Player One' }],
  ['2', { id: '2', username: 'Player Two' }],
  ['3', { id: '3', username: 'Player Three' }],
]);

function getFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

describe.skip('generateResultsImage', () => {
  const instanceId = '1';
  const baseDir = path.join(__dirname, '..');
  const testOutputPath = path.join(setupTempDir(baseDir), instanceId, 'results.png');

  const directoryPath = path.dirname(testOutputPath);
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  beforeEach(() => {
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }

    const date = new Date('2026-07-05T15:00:00Z');
    vi.setSystemTime(date);
  });

  afterEach(() => {
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
    vi.useRealTimers();
  });

  it('should generate the results image', async () => {
    const jsonPath = path.join(__dirname, '../../mock_data/mockLeaderboard.json');

    // Read mock file
    const rawJsonData = fs.readFileSync(jsonPath, 'utf8');
    const leaderboardData = Leaderboard.fromJSON(JSON.parse(rawJsonData));

    // Generate image
    await generateResultsImage(instanceId, directoryPath, leaderboardData, mockUserData);

    // Verify file asset existence on disk
    expect(fs.existsSync(testOutputPath)).toBe(true);

    // Verify file is a non-empty image
    const stats = fs.statSync(testOutputPath);
    expect(stats.size).toBeGreaterThan(1000); // Confirms it isn't an empty or blank file asset

    const hash = getFileHash(testOutputPath);
    expect(hash).toBe('9f9faa6a4e4c7ce8e3f2030d5024db65cc492e7a90986a9050bc3833edc4d78d');
  });
});
