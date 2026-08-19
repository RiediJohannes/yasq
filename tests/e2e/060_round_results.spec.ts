import { expect, test } from './test_setup.js';
import mockLeaderboard from '../../mock_data/mockLeaderboard.json';
import AxeBuilder from '@axe-core/playwright';
import { GameState } from '@yasq/shared';

const COMMON_TRACK_INFO = {
  track: {
    game: 'Game A',
    title: 'Track A',
    tags: [
      { type: 'platform', value: 'Platform A' },
      { type: 'release', value: '2026' },
    ],
  },
};

test.describe('Host UI', () => {
  test.use({
    sessionConfig: {
      state: GameState.ROUND_RESULTS,
      playerCount: 5,
      userIndex: 0,
      sessionData: {
        leaderboard: mockLeaderboard,
        currentRound: 1,
        trackInfo: COMMON_TRACK_INFO,
      },
    },
  });

  test('should display round results of all players properly', async ({ resultsPage, session }) => {
    const players = session.players;

    // Player 1 - Correct + First
    const p1 = resultsPage.getPlayerResult(0);
    await expect(p1.name).toHaveText(players[1].username);
    await expect(p1.bubble).toHaveText('234');
    await expect(p1.bubble).toHaveClass(/correct/);
    await expect(p1.bubble).toHaveClass(/first/);
    await expect(p1.time).toHaveText('1.5s');

    // Player 2 - Correct (But not first)
    const p2 = resultsPage.getPlayerResult(1);
    await expect(p2.name).toHaveText(players[2].username);
    await expect(p2.bubble).toHaveText('110');
    await expect(p2.bubble).toHaveClass(/correct/);
    await expect(p2.bubble).not.toHaveClass(/first/);
    await expect(p2.time).toHaveText('27.0s');

    // Player 3 - Incorrect
    const p3 = resultsPage.getPlayerResult(2);
    await expect(p3.name).toHaveText(players[3].username);
    await expect(p3.bubble).toHaveText('0');
    await expect(p3.bubble).toHaveClass(/incorrect/);
    await expect(p3.bubble).not.toHaveClass(/first/);
    await expect(p3.time).toHaveText('30.0s');
  });

  test('should not have any automatically detectable accessibility issues', async ({ resultsPage, page }, testInfo) => {
    await resultsPage.waitForLoaded();

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
      state: GameState.ROUND_RESULTS,
      playerCount: 5,
      userIndex: 1,
      sessionData: {
        currentRound: 1,
        trackInfo: COMMON_TRACK_INFO,
      },
    },
  });

  test('should display correct status and points earned', async ({ resultsPage, session }) => {
    const { players, api } = session;

    // User submitted correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
    ]);

    // Verify the Round Summary display
    await expect(resultsPage.resultsContainer.locator('h2')).toContainText('Results');

    // Check for the correct answer text from trackInfo
    await expect(resultsPage.resultsContainer).toContainText('Game A');
    await expect(resultsPage.resultsContainer).toContainText('Track A');

    // Verify total tag count
    await expect(resultsPage.tagBadges).toHaveCount(2);

    // Verify first tag (Platform)
    await expect(resultsPage.tagBadges.first()).toHaveText('Platform A');
    await expect(resultsPage.tagBadges.first()).toHaveAttribute('data-tooltip', 'Platform');

    // Verify second tag (Release)
    await expect(resultsPage.tagBadges.nth(1)).toHaveText('2026');
    await expect(resultsPage.tagBadges.nth(1)).toHaveAttribute('data-tooltip', 'Release');

    // Verify own result
    await expect(resultsPage.getPersonalResultStatus('correct')).toContainText('Correct! 🎉', { timeout: 10_000 });
    await expect(resultsPage.ownGuess).toContainText('Game A');
    await expect(resultsPage.ownScoreBubble).toContainText('100 pt.');
  });

  test('should display partial correct status and points earned', async ({ resultsPage, session }) => {
    const { players, api } = session;

    // User submitted partially correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 0.5, points: 50, guess: 'Game A2' }],
      },
    ]);

    // Verify own result
    await expect(resultsPage.getPersonalResultStatus('partial')).toContainText('So close! 🧗', { timeout: 10_000 });
    await expect(resultsPage.ownGuess).toContainText('Game A2');
    await expect(resultsPage.ownScoreBubble).toContainText('50 pt.');
  });

  test('should display incorrect status and zero points', async ({ resultsPage, session }) => {
    const { players, api } = session;

    // User submitted incorrect guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 0, points: 0, guess: 'Game B' }],
      },
    ]);

    // Verify own result
    await expect(resultsPage.getPersonalResultStatus('incorrect')).toContainText('Incorrect. 😢', { timeout: 10_000 });
    await expect(resultsPage.ownGuess).toContainText('Game B');
    await expect(resultsPage.ownScoreBubble).toContainText('0 pt.');
  });

  test('should display ready button and toggle status', async ({ resultsPage, sidebar, session }) => {
    const { players, api } = session;

    // User submitted correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
    ]);

    // Ready Up Interaction
    await expect(resultsPage.readyBtn).toHaveText('Ready for Next Round');
    await resultsPage.clickReady();

    // Verify local UI update
    await expect(resultsPage.readyBtn).toHaveText("I'm Ready! ✅");
    await expect(resultsPage.readyBtn).toHaveClass(/ready/);

    // Verify badge displayed
    await expect(sidebar.getBadge(players[1].username, 'ready')).toBeVisible();
  });

  test('should display correct number of correct guesses', async ({ resultsPage, session }) => {
    const { players, api } = session;

    await api.patchLeaderboard([
      // Player 1: Correct (scoreValue 1)
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
      // Player 2: Partial (scoreValue 0.5)
      {
        userId: players[2].id,
        roundHistory: [{ round: 1, scoreValue: 0.5, points: 50, guess: 'Game A2' }],
      },
      // Player 3: Wrong (scoreValue 0)
      {
        userId: players[3].id,
        roundHistory: [{ round: 1, scoreValue: 0, points: 0, guess: 'Game B' }],
      },
      // Player 4: Correct (scoreValue 1)
      {
        userId: players[4].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
    ]);

    await expect(resultsPage.correctPlayersContainer).toContainText('(2)');
  });

  test('should not have any automatically detectable accessibility issues', async ({ resultsPage, page }, testInfo) => {
    await resultsPage.waitForLoaded();

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
