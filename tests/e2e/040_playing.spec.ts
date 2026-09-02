import { GameState } from '@yasq/shared';
import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';

const PLAYING_SESSION_DATA = {
  settings: {
    rounds: 5,
    maxGuessTime: 30_000,
    enabledJokers: ['OBFUSCATION', 'TRIVIA', 'MULTIPLE_CHOICE', 'SPY'],
  },
  trackInfo: {
    url: 'some url',
    track: {
      game: 'Game A',
      title: 'Track A',
      tags: [
        { type: 'platform', value: 'Platform A' },
        { type: 'release', value: '2026' },
      ],
    },
  },
};

test.describe('Host UI', () => {
  test.use({
    sessionConfig: {
      state: GameState.PLAYING,
      playerCount: 3,
      userIndex: 0,
      sessionData: PLAYING_SESSION_DATA,
    },
  });

  test('should display information about current track', async ({ playingPage }) => {
    await expect(playingPage.hostUi).toBeVisible();

    // Verify track info
    await expect(playingPage.summary.getByText('Now playing')).toBeVisible();
    await expect(playingPage.summary.getByText('Game A')).toBeVisible();
    await expect(playingPage.summary.getByText('Track A')).toBeVisible();

    // Verify tags
    await expect(playingPage.tagBadges).toHaveCount(2);
    await expect(playingPage.getTagBadge('Platform A')).toBeVisible();
    await expect(playingPage.getTagBadge('2026')).toBeVisible();

    // Check for wait message
    await expect(playingPage.hostUi.getByText(/wait/i)).toBeVisible();
  });

  test('should not have any automatically detectable accessibility issues', async ({ playingPage, page }, testInfo) => {
    await playingPage.waitForLoaded();

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

test.describe('Player UI', () => {
  test.use({
    sessionConfig: {
      state: GameState.PLAYING,
      playerCount: 5,
      userIndex: 1,
      sessionData: PLAYING_SESSION_DATA,
    },
  });

  test('should show wait message after submitting a guess', async ({ playingPage, sidebar, session }) => {
    // Playing UI visible as expected
    await expect(playingPage.guessInput).toBeVisible();
    await expect(playingPage.waitMessage).toBeHidden();

    // Submit a guess
    await playingPage.guessInput.fill('Game XY');
    await playingPage.submitBtn.click();

    // Verify UI state change
    await expect(playingPage.guessInput).toBeHidden();
    await expect(playingPage.waitMessage).toBeVisible();
    await expect(playingPage.waitMessage).toHaveText(/wait/i);

    // Check for the GUESSED badge
    await expect(sidebar.getBadge(session.players[1].username, 'guessed')).toBeVisible();
    await expect(sidebar.getBadge(session.players[1].username, 'guessed')).toHaveText('GUESSED');
  });

  test('should switch to next state once all players have submitted a guess', async ({ playingPage, session }) => {
    // Other players submit guesses
    for (const index of [2, 4, 3]) {
      await session.api.submitGuess(session.players[index].id, 'Some Game');
    }

    // Submit own guess
    await playingPage.guessInput.fill('Game XY');
    await playingPage.submitBtn.click();

    // Verify UI state change
    await expect(playingPage.resultsUI).toBeVisible();
    await expect(playingPage.gameArena).toBeHidden();
  });

  test('should display obfuscated hint when using obfuscation joker', async ({ playingPage }) => {
    // Activate joker
    await playingPage.jokerObfuscationBtn.click();

    // Verify UI change
    await expect(playingPage.jokerObfuscationBtn).toBeDisabled();
    await expect(playingPage.hintText).toBeVisible();
    const validChars = /^[a-zA-Z0-9_\s\-!:'?]+$/;
    const text = await playingPage.hintText.innerText();
    await expect(text).toMatch(validChars);
  });

  test('should display trivia hint when using tags joker', async ({ playingPage }) => {
    // Activate joker
    await playingPage.jokerTriviaBtn.click();

    // Verify UI change
    await expect(playingPage.tagsContainer).toBeVisible();
    await expect(playingPage.tagBadges).toHaveCount(2);

    // Verify platform tag
    await expect(playingPage.getTagBadge('platform')).toContainText('Platform A');

    // Verify release tag
    await expect(playingPage.getTagBadge('release')).toContainText('2026');
  });

  test('should display 4 multiple choice buttons when using mc joker', async ({ playingPage }) => {
    // Activate joker
    await playingPage.jokerMcBtn.click();

    // Verify UI state
    await expect(playingPage.jokerMcBtn).toBeDisabled();
    await expect(playingPage.choiceButtons).toHaveCount(4);

    // Verify uniqueness (none of the buttons should have the same text)
    const texts = await playingPage.choiceButtons.allInnerTexts();
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(4);

    // Test Interaction: Click the first choice
    await playingPage.choiceButtons.first().click();

    // Verify guess successfully submitted
    await expect(playingPage.guessInput).toBeHidden();
    await expect(playingPage.waitMessage).toBeVisible();
    await expect(playingPage.waitMessage).toHaveText(/wait/i);
  });

  test('should display player answer hint when using spy joker', async ({ playingPage, session }) => {
    await playingPage.jokerSpyBtn.click();
    await expect(playingPage.spyOverlay).toBeVisible();

    await expect(playingPage.spyEmptyMsg).toBeVisible();
    await expect(playingPage.spyEmptyMsg).toHaveText(/no player has submitted/i);

    // Other players submit guesses
    for (const index of [2, 4, 3]) {
      await session.api.submitGuess(session.players[index].id, 'Game A');
    }

    // Verify order of MockPlayers in list
    await expect(playingPage.spyActionButtons.filter({ hasText: session.players[3].username })).toBeVisible();
    const buttonTexts = await playingPage.spyActionButtons.allTextContents();
    const expectedOrder = [session.players[2].username, session.players[4].username, session.players[3].username];
    expect(buttonTexts).toEqual(expectedOrder);

    // Select target
    await playingPage.getSpyPlayerButton(session.players[2].username).click();

    // Verify and use result
    await expect(playingPage.stolenResultBtn).toBeVisible();
    await expect(playingPage.stolenResultBtn).toHaveText('Game A');
    await playingPage.stolenResultBtn.click();

    // Verify UI change
    await expect(playingPage.waitMessage).toBeVisible();
    await expect(playingPage.waitMessage).toHaveText(/wait/i);
  });

  test('should not have any automatically detectable accessibility issues', async ({ playingPage, page }, testInfo) => {
    await playingPage.waitForLoaded();

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
