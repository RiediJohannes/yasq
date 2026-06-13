import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from './helper.js'
import mockLeaderboard from '../mock_data/mockLeaderboard.json';
import { TestApi } from './api.js';
import { ResultsPage } from './pages/ResultsPage.js';
import { Sidebar } from './pages/components/Sidebar.js';

test.describe('Host UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 5;
    players = generatePlayers(playerCount);
    const user = players[0];

    await page.addInitScript(({ allPlayers, user, instanceId }) => {
      window.__MOCK_PARTICIPANTS__ = allPlayers;
      window.__MOCK_USER_ID__ = user.id;
      window.__MOCK_USER_NAME__ = user.username;
      window.__MOCK_INSTANCE_ID__ = instanceId;
    }, { allPlayers: players, user: user, instanceId: currentInstanceId });

    // Setup current game state
    api = new TestApi(request, currentInstanceId);
    await api.setupSession(players, 'RESULTS', {
      leaderboard: mockLeaderboard,
      currentRound: 1,
      trackInfo: {
        track: {
          game: 'Game A',
          title: 'Track A',
          tags: [
            { type: "platform", value: "Platform A" },
            { type: "release", value: "2026" }
          ]
        }
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should display round results of all players properly', async ({ page }) => {
    const results = new ResultsPage(page);

    // Player 1 - Correct + First
    const p1 = results.getPlayerResult(0);
    await expect(p1.name).toHaveText(players[1].username);
    await expect(p1.bubble).toHaveText('234');
    await expect(p1.bubble).toHaveClass(/correct/);
    await expect(p1.bubble).toHaveClass(/first/);
    await expect(p1.time).toHaveText('1.5s');

    // Player 2 - Correct (But not first)
    const p2 = results.getPlayerResult(1);
    await expect(p2.name).toHaveText(players[2].username);
    await expect(p2.bubble).toHaveText('110');
    await expect(p2.bubble).toHaveClass(/correct/);
    await expect(p2.bubble).not.toHaveClass(/first/);
    await expect(p2.time).toHaveText('27.0s');

    // Player 3 - Incorrect
    const p3 = results.getPlayerResult(2);
    await expect(p3.name).toHaveText(players[3].username);
    await expect(p3.bubble).toHaveText('0');
    await expect(p3.bubble).toHaveClass(/incorrect/);
    await expect(p3.bubble).not.toHaveClass(/first/);
    await expect(p3.time).toHaveText('30.0s');
  });
});

test.describe('Player UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 5;
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
    await api.setupSession(players, 'RESULTS', {
      currentRound: 1,
      trackInfo: {
        track: {
          game: 'Game A',
          title: 'Track A',
          tags: [
            { type: "platform", value: "Platform A" },
            { type: "release", value: "2026" }
          ]
        }
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should display correct status and points earned', async ({ page }) => {
    const results = new ResultsPage(page);

    // User submitted correct guess
    await api.patchLeaderboard([{
      userId: players[1].id,
      roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: "Game A" }]
    }]);

    // Verify the Round Summary display
    await expect(results.resultsContainer.locator('h2')).toContainText('Results');

    // Check for the correct answer text from trackInfo
    await expect(results.resultsContainer).toContainText('Game A');
    await expect(results.resultsContainer).toContainText('Track A');

    // Verify total tag count
    await expect(results.tagBadges).toHaveCount(2);

    // Verify first tag (Platform)
    await expect(results.tagBadges.first()).toHaveText('Platform A');
    await expect(results.tagBadges.first()).toHaveAttribute('title', 'Platform');

    // Verify second tag (Release)
    await expect(results.tagBadges.nth(1)).toHaveText('2026');
    await expect(results.tagBadges.nth(1)).toHaveAttribute('title', 'Release');

  // Verify own result
    await expect(results.getPersonalResultStatus('correct')).toContainText('Correct! 🎉');
    await expect(results.ownResults).toContainText('Your guess: Game A');
    await expect(results.ownResults).toContainText('You earned 100 points');
  });

  test('should display partial correct status and points earned', async ({ page }) => {
    const results = new ResultsPage(page);

    // User submitted partially correct guess
    await api.patchLeaderboard([{
      userId: players[1].id,
      roundHistory: [{ round: 1, scoreValue: 0.5, points: 50, guess: "Game A2" }]
    }]);

    // Verify own result
    await expect(results.getPersonalResultStatus('partial')).toContainText('So close! 🧗');
    await expect(results.ownResults).toContainText('Your guess: Game A2');
    await expect(results.ownResults).toContainText('You earned 50 points');
  });

  test('should display incorrect status and zero points', async ({ page }) => {
    const results = new ResultsPage(page);

    // User submitted incorrect guess
    await api.patchLeaderboard([{
      userId: players[1].id,
      roundHistory: [{ round: 1, scoreValue: 0, points: 0, guess: "Game B" }]
    }]);

    // Verify own result
    await expect(results.getPersonalResultStatus('incorrect')).toContainText('Incorrect. 😢');
    await expect(results.ownResults).toContainText('Your guess: Game B');
    await expect(results.ownResults).toContainText('You earned 0 points');
  });

  test('should display ready button and toggle status', async ({ page }) => {
    const results = new ResultsPage(page);
    const sidebar = new Sidebar(page);

    // User submitted correct guess
    await api.patchLeaderboard([{
      userId: players[1].id,
      roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: "Game A" }]
    }]);

    // Ready Up Interaction
    await expect(results.readyBtn).toHaveText('Ready for Next Round');
    await results.clickReady();

    // Verify local UI update
    await expect(results.readyBtn).toHaveText("I'm Ready! ✅");
    await expect(results.readyBtn).toHaveClass(/ready/);

    // Verify badge displayed
    await expect(sidebar.getBadge(players[1].username, 'ready')).toBeVisible();
  });

  test('should display correct number of correct guesses', async ({ page }) => {
    const results = new ResultsPage(page);

    await api.patchLeaderboard([
      // Player 1: Correct (scoreValue 1)
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: "Game A" }]
      },
      // Player 2: Partial (scoreValue 0.5)
      {
        userId: players[2].id,
        roundHistory: [{ round: 1, scoreValue: 0.5, points: 50, guess: "Game A2" }]
      },
      // Player 3: Wrong (scoreValue 0)
      {
        userId: players[3].id,
        roundHistory: [{ round: 1, scoreValue: 0, points: 0, guess: "Game B" }]
      },
      // Player 4: Correct (scoreValue 1)
      {
        userId: players[4].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: "Game A" }]
      }
    ]);

    await expect(results.ownResults).toContainText('Number of correct players: 2');
  });
});