import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getAvatarUrl, getDisplayName, type Participant } from '@yasq/shared';
import type { Leaderboard, LeaderboardEntry, RoundResult } from './models.js';
import { logger } from './utils/logger.js';

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
  userData: Map<string, Participant>
) {
  if (!isPlaywrightExecutableInstalled()) {
    logger.warn(
      instanceId,
      `Playwright Chromium executable not found. Skipping results image generation. Please run 'npx playwright install chromium'.`
    );
    return;
  }

  const outputPath = path.join(tempDir, 'results.png');
  const cssFilePath = path.join(__dirname, '../../client/src/style.css');
  let cssContent = '';
  try {
    cssContent = fs.readFileSync(cssFilePath, 'utf8');
  } catch (err) {
    logger.error(instanceId, `Could not load client-side stylesheet`, err);
  }

  const currentDateFormatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          /* 1. Inject CSS rules */
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
        </style>
      </head>
      <body>
        <div class="final-leaderboard centered">
          <h1 class="results-title">🏆 Final Results</h1>
          <div class="leaderboard-container">
            ${leaderboardData
              .getAll()
              .map((player: LeaderboardEntry, index: number) => {
                const isWinner = index === 0;
                const user = userData.get(player.userId);

                return `
                <div class="player-wrapper">
                  <div class="player-card ${isWinner ? 'winner' : ''}">
                    <div class="player-main-info">
                      <div class="rank">#${index + 1}</div>
                      <img src="${getAvatarUrl(user!)}" class="avatar-small" draggable="false" />
                      <div class="name">${isWinner ? '👑 ' : ''}${getDisplayName(user!)}</div>
                      <div class="total-score">${player.totalScore} pts</div>
                    </div>
                    <div class="history-grid">
                      <div class="history-label">Round Breakdown:</div>
                      <div class="round-bubbles">
                        ${player.roundHistory
                          .map(
                            (r: RoundResult) => `
                          <div class="round-bubble ${r.scoreValue > 0 ? 'correct' : 'incorrect'} ${r.isFirst ? 'first' : ''}">
                            ${r.points}
                          </div>
                        `
                          )
                          .join('')}
                      </div>
                    </div>
                  </div>
                </div>
              `;
              })
              .join('')}
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

    // Store image in local temp dir
    fs.writeFileSync(outputPath, imageBuffer);
    logger.debug(instanceId, `Successfully stored image file to: ${outputPath}`);
  } finally {
    await browser.close();
  }
}
