import * as PreactCompat from 'preact/compat';
globalThis.React = PreactCompat;

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderToString } from 'preact-render-to-string';

import type { Participant } from '@yasq/shared';
import type { Leaderboard } from '../models/leaderboard.js';
import { LogCategory, logger } from '../utils/logger.js';
import type { GameStats } from '../models/game_stats.js';
import type { AchievementBonusManager } from '../models/achievement_bonus.js';
import { enrichParticipantsWithGuildNicknames } from '../utils/discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function isPlaywrightExecutableInstalled(): boolean {
  try {
    const executablePath = chromium.executablePath();
    return fs.existsSync(executablePath);
  } catch {
    return false;
  }
}

export async function generateResultsImage(
  instanceId: string,
  tempDir: string,
  leaderboardData: Leaderboard,
  userData: Map<string, Participant>,
  gameStats: GameStats,
  achievementBonusManager: AchievementBonusManager
) {
  const leaderboardModulePath: string = '../../../client/src/frontend/components/Leaderboard.js';
  const gameStatsModulePath: string = '../../../client/src/frontend/components/GameStatsSummary.js';
  const { Leaderboard } = await import(leaderboardModulePath);
  const { GameStatsSummary } = await import(gameStatsModulePath);

  if (!isPlaywrightExecutableInstalled()) {
    logger.warn(
      `Playwright Chromium executable not found. Skipping results image generation. Please run 'npx playwright install chromium'.`,
      LogCategory.GAME,
      instanceId
    );
    return;
  }

  const outputPath = path.join(tempDir, 'results.png');
  const cssFilePath = path.join(__dirname, '../../../client/src/style.css');
  let cssContent = '';
  try {
    cssContent = fs.readFileSync(cssFilePath, 'utf8');
  } catch (err: unknown) {
    logger.error(`Could not load client-side stylesheet`, LogCategory.GAME, instanceId, err as Error);
  }

  const currentDateFormatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const entries = leaderboardData.getAll();
  const achievementsObj = achievementBonusManager?.achievements
    ? Object.fromEntries(achievementBonusManager.achievements)
    : {};

  const participantsList = Array.from(userData.values());
  await enrichParticipantsWithGuildNicknames(participantsList, instanceId);

  // Render Preact components straight to HTML strings on the backend
  const leaderboardHtml = renderToString(
    <Leaderboard
      leaderboard={entries}
      achievements={achievementsObj}
      participants={participantsList}
    />
  );

  const gameStatsHtml = renderToString(
    <GameStatsSummary
      stats={gameStats}
      achievements={achievementsObj}
      participants={participantsList}
    />
  );

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <style>
          /* 1. Inject client stylesheet */
          ${cssContent}

          /* 2. Overwrite and flatten variables and animation nodes */
          body {
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
          }

          /* Force CSS Grid properties out of transitioning state */
          .player-wrapper {
            grid-template-rows: unset !important;
            display: block !important;
            overflow: visible !important;
            margin-bottom: 12px !important;
            animation: none !important;
          }

          /* Force opacity transitions and hide the continuous moving winner shimmer line */
          .player-card {
            opacity: 1 !important;
            animation: none !important;
          }

          .player-card.winner::after {
            display: none !important;
            animation: none !important;
          }

          .round-bubble {
            transform: none !important;
            transition: none !important;
          }

          .shimmer-layer,
          .shimmer-layer::after {
            animation: none !important;
            display: none !important;
          }

          .stats-and-controls, .badge {
            opacity: 1 !important;
            animation: none !important;
          }
        </style>
      </head>
      <body>
        <div class="final-leaderboard centered">
          <h1 class="results-title">🏆 Final Results</h1>

          ${leaderboardHtml}

          <div class="stats-and-controls">
            ${gameStatsHtml}
          </div>

          <p>${currentDateFormatted}</p>
        </div>
      </body>
    </html>
  `;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 650, height: 400 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });

    const elementLocator = page.locator('.final-leaderboard');
    const imageBuffer = await elementLocator.screenshot({ type: 'png' });

    fs.writeFileSync(outputPath, imageBuffer);
    logger.debug(`Successfully stored image file to: ${outputPath}`, LogCategory.GAME, instanceId);
  } finally {
    await browser.close();
  }
}
