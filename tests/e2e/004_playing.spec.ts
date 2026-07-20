import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from '../utils/helper.js'
import { PlayingPage } from './pages/PlayingPage.js';
import { Sidebar } from './pages/components/Sidebar.js';
import { TestApi } from '../utils/api.js';

test.describe('Host UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 3;
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
    await api.setupSession(players, 'PLAYING', {
      settings: {
        rounds: 5,
        trackDuration: 30_000,
        enabledJokers: ['OBFUSCATION', 'TRIVIA', 'MULTIPLE_CHOICE', 'SPY']
      },
      trackInfo: {
        url: "some url",
        track: {
          game: 'Game A',
          title: 'Track A',
          tags: [
            { 'type': 'platform', 'value': 'Platform A'},
            { 'type': 'release', 'value': '2026'}
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

  test('should display information about current track', async ({ page }) => {
    const playing = new PlayingPage(page);

    await expect(playing.hostUi).toBeVisible();

    // Verify track info
    await expect(playing.summary.getByText('Now playing')).toBeVisible();
    await expect(playing.summary.getByText('Game A')).toBeVisible();
    await expect(playing.summary.getByText('Track A')).toBeVisible();

    // Verify tags
    await expect(playing.tagBadges).toHaveCount(2);
    await expect(playing.getTagBadge('Platform A')).toBeVisible();
    await expect(playing.getTagBadge('2026')).toBeVisible();

    // Check for wait message
    await expect(playing.hostUi.getByText(/wait/i)).toBeVisible();
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
    api = new TestApi('http://localhost:3001', currentInstanceId);
    await api.setupSession(players, 'PLAYING', {
      settings: {
        rounds: 5,
        trackDuration: 30_000,
        enabledJokers: ['OBFUSCATION', 'TRIVIA', 'MULTIPLE_CHOICE', 'SPY']
      },
      trackInfo: {
        url: "some url",
        track: {
          game: 'Game A',
          title: 'Track A',
          tags: [
            { 'type': 'platform', 'value': 'Platform A'},
            { 'type': 'release', 'value': '2026'}
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

  test('should show wait message after submitting a guess', async ({ page }) => {
    const playing = new PlayingPage(page);
    const sidebar = new Sidebar(page);

    // Playing UI visible as expected
    await expect(playing.guessInput).toBeVisible();
    await expect(playing.waitMessage).toBeHidden();

    // Submit a guess
    await playing.guessInput.fill('Game XY');
    await playing.submitBtn.click();

    // Verify UI state change
    await expect(playing.guessInput).toBeHidden();
    await expect(playing.waitMessage).toBeVisible();
    await expect(playing.waitMessage).toHaveText(/wait/i);

    // Check for the GUESSED badge
    await expect(sidebar.getBadge(players[1].username, 'guessed')).toBeVisible();
    await expect(sidebar.getBadge(players[1].username, 'guessed')).toHaveText('GUESSED');
  });

  test('should switch to next state once all players have submitted a guess', async ({ page }) => {
    const playing = new PlayingPage(page);

    // Other players submit guesses
    for (const index of [2, 4, 3]) {
      await api.submitGuess(players[index].id, 'Some Game');
    }

    // Submit own guess
    await playing.guessInput.fill('Game XY');
    await playing.submitBtn.click();

    // Verify UI state change
    await expect(playing.resultsUI).toBeVisible();
    await expect(playing.gameArena).toBeHidden();
  });

  test('should display obfuscated hint when using obfuscation joker', async ({ page }) => {
    const playing = new PlayingPage(page);

    // Activate joker
    await playing.jokerObfuscationBtn.click();

    // Verify UI change
    await expect(playing.jokerObfuscationBtn).toBeDisabled();
    await expect(playing.hintText).toBeVisible();
    const validChars = /^[a-zA-Z0-9_\s\-!:'?]+$/;
    const text = await playing.hintText.innerText();
    await expect(text).toMatch(validChars);
  });

  test('should display trivia hint when using tags joker', async ({ page }) => {
    const playing = new PlayingPage(page);

    // Activate joker
    await playing.jokerTriviaBtn.click();

    // Verify UI change
    await expect(playing.tagsContainer).toBeVisible();
    await expect(playing.tagBadges).toHaveCount(2);

    // Verify platform tag
    await expect(playing.getTagBadge('platform')).toContainText('Platform A');

    // Verify release tag
    await expect(playing.getTagBadge('release')).toContainText('2026');
  });

  test('should display 4 multiple choice buttons when using mc joker', async ({ page }) => {
    const playing = new PlayingPage(page);

    // Activate joker
    await playing.jokerMcBtn.click();

    // Verify UI state
    await expect(playing.jokerMcBtn).toBeDisabled();
    await expect(playing.choiceButtons).toHaveCount(4);

    // Verify uniqueness (none of the buttons should have the same text)
    const texts = await playing.choiceButtons.allInnerTexts();
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(4);

    // Test Interaction: Click the first choice
    await playing.choiceButtons.first().click();

    // Verify guess successfully submitted
    await expect(playing.guessInput).toBeHidden();
    await expect(playing.waitMessage).toBeVisible();
    await expect(playing.waitMessage).toHaveText(/wait/i);
  });

  test('should display player answer hint when using spy joker', async ({ page }) => {
    const playing = new PlayingPage(page);

    await playing.jokerSpyBtn.click();
    await expect(playing.spyOverlay).toBeVisible();

    await expect(playing.spyEmptyMsg).toBeVisible();
    await expect(playing.spyEmptyMsg).toHaveText(/no player has submitted/i);

    // Other players submit guesses
    for (const index of [2, 4, 3]) {
      await api.submitGuess(players[index].id, 'Game A');
    }

    // Verify order of MockPlayers in list
    await expect(playing.spyActionButtons.filter({ hasText: players[3].username })).toBeVisible();
    const buttonTexts = await playing.spyActionButtons.allTextContents();
    const expectedOrder = [
      players[2].username,
      players[4].username,
      players[3].username
    ];
    expect(buttonTexts).toEqual(expectedOrder);

    // Select target
    await playing.getSpyPlayerButton(players[2].username).click();

    // Verify and use result
    await expect(playing.stolenResultBtn).toBeVisible();
    await expect(playing.stolenResultBtn).toHaveText('Game A');
    await playing.stolenResultBtn.click();

    // Verify UI change
    await expect(playing.waitMessage).toBeVisible();
    await expect(playing.waitMessage).toHaveText(/wait/i);
  });
});