import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';
import sessionData from '../../mock_data/fixtures/round_results.json';

test.describe('Host UI', () => {
  test.use({
    sessionConfig: {
      playerCount: 5,
      userIndex: 0,
      sessionData: sessionData,
    },
  });

  test('should display round results of all players properly', async ({ roundResultsPage, session }) => {
    const players = session.players;

    // Player 1 - Correct + First
    const p1 = roundResultsPage.getPlayerResult(0);
    await expect(p1.name).toHaveText(players[1].username);
    await expect(p1.bubble).toHaveText('220');
    await expect(p1.bubble).toHaveClass(/correct/);
    await expect(p1.bubble).toHaveClass(/first/);
    await expect(p1.time).toHaveText('1.5s');

    // Player 2 - Correct (But not first)
    const p2 = roundResultsPage.getPlayerResult(1);
    await expect(p2.name).toHaveText(players[2].username);
    await expect(p2.bubble).toHaveText('156');
    await expect(p2.bubble).toHaveClass(/correct/);
    await expect(p2.bubble).not.toHaveClass(/first/);
    await expect(p2.time).toHaveText('27.0s');

    // Player 3 - Incorrect
    const p3 = roundResultsPage.getPlayerResult(2);
    await expect(p3.name).toHaveText(players[3].username);
    await expect(p3.bubble).toHaveText('0');
    await expect(p3.bubble).toHaveClass(/incorrect/);
    await expect(p3.bubble).not.toHaveClass(/first/);
    await expect(p3.time).toHaveText('60.0s');
  });

  test('should not have any automatically detectable accessibility issues', async ({
    roundResultsPage,
    page,
  }, testInfo) => {
    await roundResultsPage.waitForLoaded();

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
      playerCount: 5,
      userIndex: 1,
      sessionData: sessionData,
    },
  });

  test('should display correct status and points earned', async ({ roundResultsPage, session }) => {
    const { players, api } = session;

    // User submitted correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
    ]);

    // Verify the Round Summary display
    await expect(roundResultsPage.resultsContainer.locator('h2')).toContainText('Results');

    // Check for the correct answer text from trackInfo
    await expect(roundResultsPage.resultsContainer).toContainText('Game A');
    await expect(roundResultsPage.resultsContainer).toContainText('Track A');

    // Verify total tag count
    await expect(roundResultsPage.tagBadges).toHaveCount(2);

    // Verify first tag (Platform)
    await expect(roundResultsPage.tagBadges.first()).toHaveText('Platform A');
    await expect(roundResultsPage.tagBadges.first()).toHaveAttribute('data-tooltip', 'Platform');

    // Verify second tag (Release)
    await expect(roundResultsPage.tagBadges.nth(1)).toHaveText('2026');
    await expect(roundResultsPage.tagBadges.nth(1)).toHaveAttribute('data-tooltip', 'Release');

    // Verify own result
    await expect(roundResultsPage.getPersonalResultStatus('correct')).toContainText('Correct! 🎉', { timeout: 10_000 });
    await expect(roundResultsPage.ownGuess).toContainText('Game A');
    await expect(roundResultsPage.ownScoreBubble).toContainText('100 pt.');
  });

  test('should display partial correct status and points earned', async ({ roundResultsPage, session }) => {
    const { players, api } = session;

    // User submitted partially correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 0.5, points: 50, guess: 'Game A2' }],
      },
    ]);

    // Verify own result
    await expect(roundResultsPage.getPersonalResultStatus('partial')).toContainText('So close! 🧗', {
      timeout: 10_000,
    });
    await expect(roundResultsPage.ownGuess).toContainText('Game A2');
    await expect(roundResultsPage.ownScoreBubble).toContainText('50 pt.');
  });

  test('should display incorrect status and zero points', async ({ roundResultsPage, session }) => {
    const { players, api } = session;

    // User submitted incorrect guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 0, points: 0, guess: 'Game B' }],
      },
    ]);

    // Verify own result
    await expect(roundResultsPage.getPersonalResultStatus('incorrect')).toContainText('Incorrect. 😢', {
      timeout: 10_000,
    });
    await expect(roundResultsPage.ownGuess).toContainText('Game B');
    await expect(roundResultsPage.ownScoreBubble).toContainText('0 pt.');
  });

  test('should display ready button and toggle status', async ({ roundResultsPage, sidebar, session }) => {
    const { players, api } = session;

    // User submitted correct guess
    await api.patchLeaderboard([
      {
        userId: players[1].id,
        roundHistory: [{ round: 1, scoreValue: 1, points: 100, guess: 'Game A' }],
      },
    ]);

    // Ready Up Interaction
    await expect(roundResultsPage.readyBtn).toHaveText('Ready for Next Round');
    await roundResultsPage.clickReady();

    // Verify local UI update
    await expect(roundResultsPage.readyBtn).toHaveText("I'm Ready! ✅");
    await expect(roundResultsPage.readyBtn).toHaveClass(/ready/);

    // Verify badge displayed
    await expect(sidebar.getBadge(players[1].username, 'ready')).toBeVisible();
  });

  test('should display correct number of correct guesses', async ({ roundResultsPage, session }) => {
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

    await expect(roundResultsPage.correctPlayersContainer).toContainText('(2)');
  });

  test('should not have any automatically detectable accessibility issues', async ({
    roundResultsPage,
    page,
  }, testInfo) => {
    await roundResultsPage.waitForLoaded();

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
