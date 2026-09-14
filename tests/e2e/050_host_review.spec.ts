import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';
import sessionData from '../../mock_data/fixtures/host_review.json';
import { Joker } from '@yasq/shared';

test.use({
  sessionConfig: {
    playerCount: 4,
    userIndex: 0,
    sessionData: sessionData,
  },
});

test.describe('Host UI', () => {
  test('should allow host to correct guesses and submit', async ({ hostReviewPage, session }) => {
    const players = session.players;

    // Verify host view elements
    await expect(hostReviewPage.guessList).toBeVisible();
    await expect(hostReviewPage.resultsTitle).toContainText('Results');
    await expect(hostReviewPage.resultsTrackName).toHaveText(/Game A/i);

    // Verify guesses correctly displayed
    await expect(hostReviewPage.getGuessItem(players[1].username)).toContainText('Game A');
    await expect(hostReviewPage.getGuessItem(players[2].username)).toContainText('Game A2');

    // Verify "Wrong" selected by default
    await expect(hostReviewPage.getCorrectionRadio(players[1].id, 'wrong')).toBeChecked();
    await expect(hostReviewPage.getCorrectionRadio(players[2].id, 'wrong')).toBeChecked();

    // Verify text that Player 4 has not submitted a guess is displayed correctly
    await expect(hostReviewPage.timedOutSection).toContainText(
      new RegExp(`No Guess submitted:.*${players[3].username}`, 'i')
    );

    // Select "Correct" for Player 2
    await hostReviewPage.setGuessResult(players[1].id, 'correct');
    await expect(hostReviewPage.getCorrectionRadio(players[1].id, 'wrong')).not.toBeChecked();

    // Select "Partially Correct" for Player 3
    await hostReviewPage.setGuessResult(players[2].id, 'partial');
    await expect(hostReviewPage.getCorrectionRadio(players[2].id, 'wrong')).not.toBeChecked();

    // Verify submit button behavior
    await expect(hostReviewPage.submitReviewedBtn).toBeEnabled();
    await hostReviewPage.submitReviewedBtn.click();
    await expect(hostReviewPage.submitReviewedBtn).toBeDisabled();
  });

  test('should display joker icon if used by player', async ({ hostReviewPage, session }) => {
    const players = session.players;

    // Verify player 1 has joker icon with correct tooltip
    const joker = hostReviewPage.getJokerIndicator(players[1].username, Joker.TRIVIA);
    await expect(joker).toBeVisible();
    await expect(joker.locator('svg')).toBeVisible();

    // Verify player 2 has NO joker icon
    await expect(hostReviewPage.getJokerIndicator(players[2].username)).toHaveCount(0);
  });

  test('should update streak badges correctly when submitting corrections', async ({
    hostReviewPage,
    sidebar,
    session,
  }) => {
    const players = session.players;

    // Verify initial streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 3');
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5');
    await expect(sidebar.getBadge(players[3].username, 'streak')).toContainText('🔥 1');

    // Correct results
    await hostReviewPage.setGuessResult(players[1].id, 'correct');
    await hostReviewPage.setGuessResult(players[2].id, 'partial');
    await hostReviewPage.submitReviewedBtn.click();

    // Verify updated streak badges
    await expect(sidebar.getBadge(players[1].username, 'streak')).toContainText('🔥 4'); // increase streak by 1
    await expect(sidebar.getBadge(players[2].username, 'streak')).toContainText('🔥 5'); // keep streak at 5
    await expect(sidebar.getBadge(players[3].username, 'streak')).not.toBeVisible(); // lose whole streak
  });

  test('should not have any automatically detectable accessibility issues', async ({
    hostReviewPage,
    page,
  }, testInfo) => {
    await hostReviewPage.waitForLoaded();

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
