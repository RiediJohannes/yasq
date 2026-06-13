import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from './helper.js'
import mockLeaderboard from '../mock_data/mockLeaderboard.json';
import { GameFinishedPage } from './pages/GameFinishedPage.js';
import { Sidebar } from './pages/components/Sidebar.js';
import { TestApi } from './api.js';

test.describe('Player UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 4;
    players = generatePlayers(playerCount);
    const user = players[1];

    await page.addInitScript(({ allPlayers, user, instanceId }) => {
      window.__MOCK_PARTICIPANTS__ = allPlayers;
      window.__MOCK_USER_ID__ = user.id;
      window.__MOCK_USER_NAME__ = user.username;
      window.__MOCK_INSTANCE_ID__ = instanceId;
    }, { allPlayers: players, user: user, instanceId: currentInstanceId });

    // Setup current game state
    api = new TestApi(request, currentInstanceId);
    await api.setupSession(players, 'GAME_FINISHED', {
      leaderboard: mockLeaderboard,
      lastWinnerId: players[1].id
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should display final leaderboard with correct scores and round history', async ({ page }) => {
    const gameFinished = new GameFinishedPage(page);

    // Verify total count
    await expect(gameFinished.playerCards).toHaveCount(3);

    // Check the Last Entry (Rank #3)
    const thirdPlace = gameFinished.getPlayerCard(2);
    await expect(thirdPlace.card).not.toHaveClass(/winner/);
    await expect(thirdPlace.rank).toHaveText('#3');
    await expect(thirdPlace.name).toContainText('MockPlayer3');
    await expect(thirdPlace.score).toContainText('0 pts');
    await expect(thirdPlace.getBubbles('incorrect')).toHaveCount(3);
    await expect(thirdPlace.bubbles.first()).toContainText('0');

    // Check the Middle Entry (Rank #2)
    const secondPlace = gameFinished.getPlayerCard(1);
    await expect(secondPlace.card).not.toHaveClass(/winner/);
    await expect(secondPlace.rank).toHaveText('#2');
    await expect(secondPlace.name).toContainText('MockPlayer2');
    await expect(secondPlace.score).toContainText('421 pts');

    // Check the Winner (Rank #1)
    const firstPlace = gameFinished.getPlayerCard(0);
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
    await expect(gameFinished.readyBtn).toBeVisible();
    await expect(gameFinished.restartBtn).toBeHidden();
  });

  test('should display winner badge in sidebar', async ({ page }) => {
    const sidebar = new Sidebar(page); // Utilizing existing SidebarPage class

    await expect(sidebar.getBadge(players[1].username, 'winner')).toBeVisible();
    await expect(sidebar.getBadge(players[1].username, 'winner')).toHaveText('👑');
  });
});