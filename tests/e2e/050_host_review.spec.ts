import { expect, test } from './test_setup.js';
import { generatePlayers } from '../utils/helper.js';
import AxeBuilder from '@axe-core/playwright';
import { GameState } from '@yasq/shared';

const initialPlayers = generatePlayers(4);

test.use({
  sessionConfig: {
    state: GameState.HOST_REVIEW,
    playerCount: 4,
    userIndex: 0,
    sessionData: {
      currentRound: 1,
      trackInfo: {
        url: 'some url',
        track: {
          game: 'Game A',
          title: 'Track A',
        },
      },
      guesses: {
        1: {
          [initialPlayers[1].id]: { text: 'Game A' },
          [initialPlayers[2].id]: { text: 'Game A2' },
        },
      },
      usedJokers: {
        [initialPlayers[1].id]: {
          TRIVIA: 1,
        },
      },
      streaks: {
        [initialPlayers[1].id]: 3,
        [initialPlayers[2].id]: 5,
        [initialPlayers[3].id]: 1,
      },
    },
  },
});

test.describe('Host UI', () => {
  test('should allow host to correct guesses and submit', async ({ roundCompletedPage, session }) => {
    const players = session.players;

    // Verify host view elements
    await expect(roundCompletedPage.guessList).toBeVisible();
    await expect(roundCompletedPage.resultsTitle).toContainText('Results');
    await expect(roundCompletedPage.resultsTrackName).toHaveText(/Game A/i);

    // Verify guesses correctly displayed
    await expect(roundCompletedPage.getGuessItem(players[1].username)).toContainText('Game A');
    await expect(roundCompletedPage.getGuessItem(players[2].username)).toContainText('Game A2');

    // Verify "Wrong" selected by default
    await expect(roundCompletedPage.getCorrectionRadio(players[1].id, 'wrong')).toBeChecked();
    await expect(roundCompletedPage.getCorrectionRadio(players[2].id, 'wrong')).toBeChecked();

    // Verify text that Player 4 has not submitted a guess is displayed correctly
    await expect(roundCompletedPage.timedOutSection).toContainText(
      new RegExp(`No Guess submitted:.*${players[3].username}`, 'i')
    );

    // Select "Correct" for Player 2
    await roundCompletedPage.setGuessResult(players[1].id, 'correct');
    await expect(roundCompletedPage.getCorrectionRadio(players[1].id, 'wrong')).not.toBeChecked();

    // Select "Partially Correct" for Player 3
    await roundCompletedPage.setGuessResult(players[2].id, 'partial');
    await expect(roundCompletedPage.getCorrectionRadio(players[2].id, 'wrong')).not.toBeChecked();

    // Verify submit button behavior
    await expect(roundCompletedPage.submitReviewedBtn).toBeEnabled();
    await roundCompletedPage.submitReviewedBtn.click();
    await expect(roundCompletedPage.submitReviewedBtn).toBeDisabled();
  });

  test('should display joker icon if used by player', async ({ roundCompletedPage, session }) => {
    const players = session.players;
    const triviaDescription = 'Reveals metadata about the game';

    // Verify player 1 has joker icon with correct tooltip
    const joker = roundCompletedPage.getJokerIndicator(players[1].username, triviaDescription);
    await expect(joker).toBeVisible();
    await expect(joker.locator('svg')).toBeVisible();

    // Verify player 2 has NO joker icon
    await expect(roundCompletedPage.getJokerIndicator(players[2].username)).toHaveCount(0);
  });

  test('should update streak badges correctly when submitting corrections', async ({
    roundCompletedPage,
    sidebar,
    session,
  }) => {
    const players = session.players;

    // Verify initial streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 3');
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5');
    await expect(sidebar.getBadge(players[3].username, 'streak')).toContainText('🔥 1');

    // Correct results
    await roundCompletedPage.setGuessResult(players[1].id, 'correct');
    await roundCompletedPage.setGuessResult(players[2].id, 'partial');
    await roundCompletedPage.submitReviewedBtn.click();

    // Verify updated streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 4'); // increase streak by 1
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5'); // keep streak at 5
    await expect(sidebar.getBadge(players[3].username, 'streak')).not.toBeVisible(); // lose whole streak
  });

  test('should not have any automatically detectable accessibility issues', async ({
    roundCompletedPage,
    page,
  }, testInfo) => {
    await roundCompletedPage.waitForLoaded();

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
