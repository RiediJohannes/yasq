import { expect, test } from './test_setup.js';
import { generatePlayers } from '../utils/helper.js';
import mockLeaderboard from '../../mock_data/mockLeaderboard.json';
import AxeBuilder from '@axe-core/playwright';
import { GameState } from '@yasq/shared';

const initialPlayers = generatePlayers(4);

test.use({
  sessionConfig: {
    state: GameState.FINAL_RESULTS,
    playerCount: 4,
    userIndex: 1,
    sessionData: {
      leaderboard: mockLeaderboard,
      lastWinnerId: initialPlayers[1].id,
    },
  },
});

test.describe('Player UI', () => {
  test('should display final leaderboard with correct scores and round history', async ({ gameFinishedPage }) => {
    // Verify total count
    await expect(gameFinishedPage.playerCards).toHaveCount(3);

    // Check the Last Entry (Rank #3)
    const thirdPlace = gameFinishedPage.getPlayerCard(2);
    await expect(thirdPlace.card).not.toHaveClass(/winner/);
    await expect(thirdPlace.rank).toHaveText('#3');
    await expect(thirdPlace.name).toContainText('MockPlayer3');
    await expect(thirdPlace.score).toContainText('0 pts');
    await expect(thirdPlace.getBubbles('incorrect')).toHaveCount(3);
    await expect(thirdPlace.bubbles.first()).toContainText('0');

    // Check the Middle Entry (Rank #2)
    const secondPlace = gameFinishedPage.getPlayerCard(1);
    await expect(secondPlace.card).not.toHaveClass(/winner/);
    await expect(secondPlace.rank).toHaveText('#2');
    await expect(secondPlace.name).toContainText('MockPlayer2');
    await expect(secondPlace.score).toContainText('421 pts');

    // Check the Winner (Rank #1)
    const firstPlace = gameFinishedPage.getPlayerCard(0);
    await expect(firstPlace.card).toHaveClass(/winner/);
    await expect(firstPlace.rank).toHaveText('#1');
    await expect(firstPlace.name).toContainText('MockPlayer1');
    await expect(firstPlace.score).toContainText('585 pts');

    await expect(firstPlace.bubbles).toHaveCount(3);
    await expect(firstPlace.bubbles.first()).toHaveClass(/correct/);
    await expect(firstPlace.bubbles.first()).toHaveClass(/first/);
    await expect(firstPlace.bubbles.nth(2)).toHaveClass(/correct/);
    await expect(firstPlace.bubbles.nth(2)).not.toHaveClass(/first/);

    // Verify UI visibility
    await expect(gameFinishedPage.readyBtn).toBeVisible();
    await expect(gameFinishedPage.restartBtn).toBeHidden();
  });

  test('should display winner badge in sidebar', async ({ sidebar, session }) => {
    await expect(sidebar.getBadge(session.players[1].username, 'winner')).toBeVisible();
    await expect(sidebar.getBadge(session.players[1].username, 'winner')).toHaveText('👑');
  });

  test('should not have any automatically detectable accessibility issues', async ({
    gameFinishedPage,
    page,
  }, testInfo) => {
    await gameFinishedPage.waitForLoaded();

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
