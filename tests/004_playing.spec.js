import { test, expect } from '@playwright/test';
import { generatePlayers } from './helper.js'

test.describe('Host UI', () => {

  let players = [];
  let currentInstanceId;

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

    await request.post('http://localhost:3001/api/test/setup-session', {
      data: {
        instanceId: currentInstanceId,
        hostId: players[0].id,
        registeredUsers: players,
        state: 'PLAYING',
        readyUserIds: [],
        settings: {
          rounds: 5,
          trackDuration: 30000,
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
        },
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`http://localhost:3001/api/test/instance/${currentInstanceId}`);
  });

  test('should display information about current track', async ({ page }) => {
    const hostUi = page.locator('#game-host-ui');
    await expect(hostUi).toBeVisible();

    // Verify track info
    const summary = hostUi.locator('.round-result-summary');
    await expect(summary.getByText('Now playing')).toBeVisible();
    await expect(summary.getByText('Game A')).toBeVisible();
    await expect(summary.getByText('Track A')).toBeVisible();

    // Verify tags
    const tags = summary.locator('.tag-badge');
    await expect(tags).toHaveCount(2);
    await expect(tags.filter({ hasText: 'Platform A' })).toBeVisible();
    await expect(tags.filter({ hasText: '2026' })).toBeVisible();

    // Check for wait message
    await expect(hostUi.getByText(/wait/i)).toBeVisible();
  });
});

test.describe('Player UI', () => {

  let players = [];
  let currentInstanceId;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 3;
    players = generatePlayers(playerCount);
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
        state: 'PLAYING',
        readyUserIds: [],
        settings: {
          rounds: 5,
          trackDuration: 30000,
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
        },
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`http://localhost:3001/api/test/instance/${currentInstanceId}`);
  });

  test('should show wait message after submitting a guess', async ({ page }) => {
    const guessInput = page.locator('#guess-input');
    const submitBtn = page.locator('#btn-submit');
    const waitMessage = page.locator('#waiting-msg');

    // Playing UI visible as expected
    await expect(guessInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(waitMessage).toBeHidden();

    // Submit a guess
    await guessInput.fill('Game XY');
    await submitBtn.click();

    // Verify UI state change
    await expect(guessInput).toBeHidden();
    await expect(submitBtn).toBeHidden();
    await expect(waitMessage).toBeVisible();
    await expect(waitMessage).toHaveText(/wait/i);

    // Check for the GUESSED badge
    const playerEntry = page.locator(`.player-entry:has-text("${players[1].username}")`);
    await expect(playerEntry.locator('.badge.guessed')).toBeVisible();
    await expect(playerEntry.locator('.badge.guessed')).toHaveText('GUESSED');
  });

  test('should switch to next state once all players have submitted a guess', async ({ page, request }) => {
    const guessInput = page.locator('#guess-input');
    const submitBtn = page.locator('#btn-submit');
    const gameArena = page.locator('#game-arena');
    const resultsUI = page.locator('#results');

    // Other player submits guess
    await request.post('http://localhost:3001/api/submit-guess', {
      data: {
        instanceId: currentInstanceId,
        guess: 'Some Game'
      },
      headers: {
        'Authorization': `Bearer token_${players[2].id}`,
        'Content-Type': 'application/json'
      }
    });

    // Submit own guess
    await guessInput.fill('Game XY');
    await submitBtn.click();

    // Verify UI state change
    await expect(resultsUI).toBeVisible();
    await expect(gameArena).toBeHidden();
  });

  test('should display obfuscated hint when using obfuscation joker', async ({ page }) => {
    const jokerBtn = page.locator('#btn-joker-obfuscation');
    const hintText = page.locator('#obfuscation-hint-text');

    // Activate joker
    await jokerBtn.click();

    // Verify UI change
    await expect(jokerBtn).toBeDisabled();
    await expect(hintText).toBeVisible();
    const validChars = /^[a-zA-Z0-9_\s\-!:'?]+$/;
    const text = await hintText.innerText();
    await expect(text).toMatch(validChars);
  });

  test('should display trivia hint when using tags joker', async ({ page }) => {
    const jokerBtn = page.locator('#btn-joker-trivia');
    const tagsContainer = page.locator('.tags-container');
    const tagBadges = page.locator('.tag-badge');

    // Activate joker
    await jokerBtn.click();

    // Verify UI change
    await expect(tagsContainer).toBeVisible();
    await expect(tagBadges).toHaveCount(2);

    // Verify platform tag
    const platformTag = page.locator('.tag-badge', { hasText: 'platform' });
    await expect(platformTag).toContainText('Platform A');

    // Verify release tag
    const releaseTag = page.locator('.tag-badge', { hasText: 'release' });
    await expect(releaseTag).toContainText('2026');
  });

  test('should display 4 multiple choice buttons when using mc joker', async ({ page }) => {
    const jokerBtn = page.locator('#btn-joker-multiple-choice');
    const choiceButtons = page.locator('.choice-button');
    const guessInput = page.locator('#guess-input');
    const waitMessage = page.locator('#waiting-msg');

    // Activate joker
    await jokerBtn.click();

    // Verify UI state
    await expect(jokerBtn).toBeDisabled();
    await expect(choiceButtons).toHaveCount(4);

    // Verify uniqueness (none of the buttons should have the same text)
    const texts = await choiceButtons.allInnerTexts();
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(4);

    // Test Interaction: Click the first choice
    await choiceButtons.first().click();

    // Verify guess successfully submitted
    await expect(guessInput).toBeHidden();
    await expect(waitMessage).toBeVisible();
    await expect(waitMessage).toHaveText(/wait/i);
  });

  test('should display player answer hint when using spy joker', async ({ page, request }) => {
    const jokerBtn = page.locator('#btn-joker-spy');
    const targetUser = players[2];

    await jokerBtn.click();

    const spyOverlay = page.locator('.hint-container:has-text("Pick a player to spy on")');
    await expect(spyOverlay).toBeVisible();

    const emptyMsg = spyOverlay.locator('.no-results');
    await expect(emptyMsg).toBeVisible();
    await expect(emptyMsg).toHaveText(/no player has submitted/i);

    await request.post('http://localhost:3001/api/submit-guess', {
      data: {
        instanceId: currentInstanceId,
        guess: 'Game A'
      },
      headers: {
        'Authorization': `Bearer token_${targetUser.id}`,
        'Content-Type': 'application/json'
      }
    });

    const targetBtn = spyOverlay.locator('button').filter({ hasText: targetUser.username });
    await expect(targetBtn).toBeVisible();
    await targetBtn.click();

    const stolenResultBtn = page.locator('.choice-button');
    await expect(stolenResultBtn).toBeVisible();
    await expect(stolenResultBtn).toHaveText('Game A');

    await stolenResultBtn.click();
    await expect(page.locator('#waiting-msg')).toBeVisible();
  });
});