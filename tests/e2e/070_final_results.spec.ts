import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';
import sessionData from '../../mock_data/fixtures/final_results.json';

import * as crypto from 'crypto';
import sharp from 'sharp';

test.describe('Host UI', () => {
  test.use({
    sessionConfig: {
      playerCount: 4,
      userIndex: 0,
      sessionData: sessionData,
    },
  });

  test('should download the results image with the expected hash', async ({ page, finalResultsPage }) => {
    await finalResultsPage.imageDownloadBtn.waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download');
    await finalResultsPage.imageDownloadBtn.click();
    const download = await downloadPromise;

    const filePath = './tests/e2e/test-results/downloaded-results.png';
    await download.saveAs(filePath);

    const metadata = await sharp(filePath).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1300);
    expect(metadata.height).toBe(1842);

    // crop date to get fixed content
    const badgeBuffer = await sharp(filePath).extract({ left: 0, top: 0, width: 1300, height: 1750 }).png().toBuffer();
    const currentHash = crypto.createHash('sha256').update(badgeBuffer).digest('hex');

    const allowedHashes = [
      '80d79220f78167d070a82a25276f9d5364486f8b479f6be9eb4bd7e3e0abdac7', // Windows
      '036487e2b6bf91e495a43189063a972a253d78c8baabe846eab3d2bfc8021346', // CI Pipeline
    ];

    expect(allowedHashes).toContain(currentHash);
  });
});

test.describe('Player UI', () => {
  test.use({
    sessionConfig: {
      playerCount: 4,
      userIndex: 1,
      sessionData: sessionData,
    },
  });

  test('should display final leaderboard with correct scores and round history', async ({ finalResultsPage }) => {
    // Verify total count
    await expect(finalResultsPage.playerCards).toHaveCount(3);

    // Check the Last Entry (Rank #3)
    const thirdPlace = finalResultsPage.getPlayerCard(2);
    await expect(thirdPlace.card).not.toHaveClass(/winner/);
    await expect(thirdPlace.rank).toHaveText('#3');
    await expect(thirdPlace.name).toContainText('MockPlayer3');
    await expect(thirdPlace.score).toContainText('0 pts');
    await expect(thirdPlace.getBubbles('incorrect')).toHaveCount(3);
    await expect(thirdPlace.bubbles.first()).toContainText('0');

    // Check the Middle Entry (Rank #2)
    const secondPlace = finalResultsPage.getPlayerCard(1);
    await expect(secondPlace.card).not.toHaveClass(/winner/);
    await expect(secondPlace.rank).toHaveText('#2');
    await expect(secondPlace.name).toContainText('MockPlayer2');
    await expect(secondPlace.score).toContainText('578 pts');

    // Check the Winner (Rank #1)
    const firstPlace = finalResultsPage.getPlayerCard(0);
    await expect(firstPlace.card).toHaveClass(/winner/);
    await expect(firstPlace.rank).toHaveText('#1');
    await expect(firstPlace.name).toContainText('MockPlayer1');
    await expect(firstPlace.score).toContainText('761 pts');

    await expect(firstPlace.bubbles).toHaveCount(3);
    await expect(firstPlace.bubbles.first()).toHaveClass(/correct/);
    await expect(firstPlace.bubbles.first()).toHaveClass(/first/);
    await expect(firstPlace.bubbles.nth(2)).toHaveClass(/correct/);
    await expect(firstPlace.bubbles.nth(2)).not.toHaveClass(/first/);

    // Verify UI visibility
    await expect(finalResultsPage.readyBtn).toBeVisible();
    await expect(finalResultsPage.restartBtn).toBeHidden();
  });

  test('should properly display game stats summary and values', async ({ finalResultsPage }) => {
    await expect(finalResultsPage.gameStats).toBeVisible();
    await expect(finalResultsPage.statItems).toHaveCount(5);

    // 1. Duration
    const durationItem = finalResultsPage.getStatItem(0);
    await expect(durationItem.label).toHaveText('Duration');
    await expect(durationItem.value).toHaveText('5m 0s');

    // 2. Best Round
    const bestRoundItem = finalResultsPage.getStatItem(1);
    await expect(bestRoundItem.label).toHaveText('Best Round');
    await expect(bestRoundItem.value).toHaveText('Round 3');
    await expect(bestRoundItem.subValue).not.toBeEmpty();

    // 3. Least Round
    const leastRoundItem = finalResultsPage.getStatItem(2);
    await expect(leastRoundItem.label).toHaveText('Least Round');
    await expect(leastRoundItem.value).toHaveText('Round 1');
    await expect(leastRoundItem.subValue).not.toBeEmpty();

    // 4. Fastest Correct Guess
    const fastestItem = finalResultsPage.getStatItem(3);
    await expect(fastestItem.label).toHaveText('Fastest Correct Guess');
    await expect(fastestItem.value).toContainText('MockPlayer2');
    await expect(fastestItem.subValue).toContainText('0.5s (Round 3)');
    await expect(fastestItem.avatar).toBeVisible();

    // 5. Highest Streak
    const streakItem = finalResultsPage.getStatItem(4);
    await expect(streakItem.label).toHaveText('Highest Streak');
    await expect(streakItem.value).toContainText('MockPlayer1');
    await expect(streakItem.subValue).toContainText('3');
    await expect(streakItem.avatar).toBeVisible();
  });

  test('should display winner badge in sidebar', async ({ sidebar, session }) => {
    await expect(sidebar.getBadge(session.players[1].username, 'winner')).toBeVisible();
    await expect(sidebar.getBadge(session.players[1].username, 'winner')).toHaveText('👑');
  });

  test('should not have any automatically detectable accessibility issues', async ({
    finalResultsPage,
    page,
  }, testInfo) => {
    await finalResultsPage.waitForLoaded();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'page-has-heading-one'])
      .analyze();

    await testInfo.attach('violations', {
      body: JSON.stringify(accessibilityScanResults.violations, null, 2),
      contentType: 'application/json',
    });

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
