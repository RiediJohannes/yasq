import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from '../utils/helper.js'
import { RoundCompletedPage } from './pages/RoundCompletedPage.js';
import { TestApi } from '../utils/api.js';
import { Sidebar } from './pages/components/Sidebar.js';

test.describe('Host UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 4;
    players = generatePlayers(playerCount);
    const user = players[0];

    await page.addInitScript(({ allPlayers, user, instanceId }) => {
      window.__MOCK_PARTICIPANTS__ = allPlayers;
      window.__MOCK_USER_ID__ = user.id;
      window.__MOCK_USER_NAME__ = user.username;
      window.__MOCK_INSTANCE_ID__ = instanceId;
    }, { allPlayers: players, user: user, instanceId: currentInstanceId });

    // Setup current game state
    api = new TestApi('http://localhost:3001', currentInstanceId);
    await api.setupSession(players, 'ROUND_COMPLETED', {
      currentRound: 1,
      trackInfo: {
        url: "some url",
        track: {
          game: 'Game A',
          title: 'Track A',
        }
      },
      guesses: {
        1: {
          [players[1].id]: { text: "Game A" },
          [players[2].id]: { text: "Game A2" }
        }
      },
      usedJokers: {
        [players[1].id]: {
          "TRIVIA": 1
        }
      },
      streaks: {
        [players[1].id]: 3,
        [players[2].id]: 5,
        [players[3].id]: 1
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should allow host to correct guesses and submit', async ({ page }) => {
    const roundCompleted = new RoundCompletedPage(page);

    // Verify host view elements
    await expect(roundCompleted.guessList).toBeVisible();
    await expect(roundCompleted.resultsTitle).toContainText('Results');
    await expect(roundCompleted.resultsTrackName).toHaveText(/Game A/i);

    // Verify guesses correctly displayed
    await expect(roundCompleted.getGuessItem(players[1].username)).toContainText('Game A');
    await expect(roundCompleted.getGuessItem(players[2].username)).toContainText('Game A2');

    // Verify "Wrong" selected by default
    await expect(roundCompleted.getCorrectionRadio(players[1].id, 'wrong')).toBeChecked();
    await expect(roundCompleted.getCorrectionRadio(players[2].id, 'wrong')).toBeChecked();

    // Verify text that Player 4 has not submitted a guess is displayed correctly
    await expect(roundCompleted.timedOutSection).toContainText(new RegExp(`No Guess submitted:.*${players[3].username}`, 'i'));

    // Select "Correct" for Player 2
    await roundCompleted.setGuessResult(players[1].id, 'correct');
    await expect(roundCompleted.getCorrectionRadio(players[1].id, 'wrong')).not.toBeChecked();

    // Select "Partially Correct" for Player 3
    await roundCompleted.setGuessResult(players[2].id, 'partial');
    await expect(roundCompleted.getCorrectionRadio(players[2].id, 'wrong')).not.toBeChecked();

    // Verify submit button behavior
    await expect(roundCompleted.submitReviewedBtn).toBeEnabled();
    await roundCompleted.submitReviewedBtn.click();
    await expect(roundCompleted.submitReviewedBtn).toBeDisabled();
  });

  test('should display joker icon if used by player', async ({ page }) => {
    const roundCompleted = new RoundCompletedPage(page);
    const triviaDescription = "Reveals metadata about the game";

    // Verify player 1 has joker icon with correct tooltip
    const joker = roundCompleted.getJokerIndicator(players[1].username, triviaDescription);
    await expect(joker).toBeVisible();
    await expect(joker.locator('svg')).toBeVisible();

    // Verify player 2 has NO joker icon
    await expect(roundCompleted.getJokerIndicator(players[2].username)).toHaveCount(0);
  });

  test('should update streak badges correctly when submitting corrections', async ({ page }) => {
    const roundCompleted = new RoundCompletedPage(page);
    const sidebar = new Sidebar(page);

    // Verify initial streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 3');
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5');
    await expect(sidebar.getBadge(players[3].username, 'streak')).toContainText('🔥 1');

    // Correct results
    await roundCompleted.setGuessResult(players[1].id, 'correct');
    await roundCompleted.setGuessResult(players[2].id, 'partial');
    await roundCompleted.submitReviewedBtn.click();

    // Verify updated streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 4'); // increase streak by 1
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5'); // keep streak at 5
    await expect(sidebar.getBadge(players[3].username, 'streak')).not.toBeVisible(); // lose whole streak
  });
});