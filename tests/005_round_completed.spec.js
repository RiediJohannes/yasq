import { test, expect } from '@playwright/test';
import { generatePlayers } from './helper.js'

test.describe('Host UI', () => {

  let players = [];
  let currentInstanceId;

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

    await request.post('http://localhost:3001/api/test/setup-session', {
      data: {
        instanceId: currentInstanceId,
        hostId: players[0].id,
        registeredUsers: players,
        state: 'ROUND_COMPLETED',
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
            [players[2].id]: { text: "Game B" }
          }
        },
        readyUserIds: [],
        usedJokers: {
          [players[1].id]: {
            "TRIVIA": 1
          }
        }
      }
    });

    await page.goto('/?mock=true');
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`http://localhost:3001/api/test/instance/${currentInstanceId}`);
  });

  test('should allow host to correct guesses and submit', async ({ page }) => {
    // Verify host view elements
    await expect(page.locator('#guess-list')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Results');
    await expect(page.locator('#results p >> strong')).toHaveText(/Game A/i);

    // Verify guesses correctly displayed
    const player1Entry = page.locator(`.guess-item:has-text("${players[1].username}")`);
    await expect(player1Entry).toContainText('Game A');
    const player2Entry = page.locator(`.guess-item:has-text("${players[2].username}")`);
    await expect(player2Entry).toContainText('Game B');

    // Verify "Wrong" selected by default
    const player1WrongRadio = page.locator(`#wrong-${players[1].id}`);
    await expect(player1WrongRadio).toBeChecked();
    const player2WrongRadio = page.locator(`#wrong-${players[2].id}`);
    await expect(player2WrongRadio).toBeChecked();

    // Verify text that Player 4 has not submitted a guess is displayed correctly
    const timedOutSection = page.locator('.timed-out-section');
    await expect(timedOutSection).toBeVisible();
    const player4Name = players[3].username;
    await expect(timedOutSection).toContainText(new RegExp(`No Guess submitted:.*${player4Name}`, 'i'));

    // Select "Correct" for Player 2
    const correctLabel = page.locator(`label[for="correct-${players[1].id}"]`);
    await correctLabel.click();
    await expect(player1WrongRadio).not.toBeChecked();

    // Verify submit button behavior
    const submitBtn = page.locator('#btn-submit-reviewed-results');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    await expect(submitBtn).toBeDisabled();
  });

  test('should display joker icon if used by player', async ({ page }) => {
    // Verify player 1 has joker icon
    const player1Entry = page.locator(`.guess-item:has-text("${players[1].username}")`);
    const triviaDescription = "Reveals metadata about the game";

    const jokerIndicator = player1Entry.locator(`.joker-indicator[data-tooltip="${triviaDescription}"]`);

    await expect(jokerIndicator).toBeVisible();
    await expect(jokerIndicator.locator('svg')).toBeVisible();

    // Verify player 2 has joker icon
    const player2Entry = page.locator(`.guess-item:has-text("${players[2].username}")`);
    const player2Joker = player2Entry.locator('.joker-indicator');

    await expect(player2Joker).toHaveCount(0);
  });
});

test.describe('Player UI', () => {
  let players = [];
  let currentInstanceId;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    players = generatePlayers(3);
    const user = players[1];

    await page.addInitScript(({ allPlayers, user, instanceId }) => {
      window.__MOCK_PARTICIPANTS__ = allPlayers;
      window.__MOCK_USER_ID__ = user.id;
      window.__MOCK_USER_NAME__ = user.username;
      window.__MOCK_INSTANCE_ID__ = instanceId;
    }, { allPlayers: players, user: user, instanceId: currentInstanceId });

    await request.post('http://localhost:3001/api/test/setup-session', {
      data: {
        instanceId: currentInstanceId,
        hostId: players[0].id,
        registeredUsers: players,
        state: 'ROUND_COMPLETED',
        readyUserIds: []
      }
    });

    await page.goto('/?mock=true');
  });

  test('should display waiting message to guessers', async ({ page }) => {
    // Verify the waiting test displayed
    await expect(page.locator('#results')).toContainText('Waiting for host to review answers...');

    // Verify host controls are hidden
    await expect(page.locator('#btn-submit-reviewed-results')).toBeHidden();
    await expect(page.locator('#guess-list')).toBeHidden();
  });
});