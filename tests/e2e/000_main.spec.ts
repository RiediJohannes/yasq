import { expect, test } from './test_setup.js';
import {
  AchievementBonusMode,
  FirstBonusMultiplier,
  GamePhase,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';
import { EXPECTED_TIME_BONUS_LABELS, toBonusPercent } from '../utils/helper';

test.describe('Home', () => {
  test.use({
    sessionConfig: {
      playerCount: 2,
      userIndex: 0,
      sessionData: {
        state: { phase: GamePhase.SETUP },
      },
    },
  });

  test('should display a generic title and no game settings button outside a running game', async ({
    header,
    session,
    lobbyPage,
    playingPage,
  }) => {
    await expect(header.title).toHaveText('YASQ');
    await expect(header.gameSettingsBtn).not.toBeVisible();

    // The other header buttons are there
    await expect(header.howToPlayBtn).toBeVisible();
    await expect(header.howToPlayBtn).toBeEnabled();

    await expect(header.localSettingsBtn).toBeVisible();
    await expect(header.localSettingsBtn).toBeEnabled();

    // Same is true on the lobby page
    await session.api.patchState({ phase: GamePhase.LOBBY });
    await lobbyPage.settingsSummary.waitFor();

    await expect(header.title).toHaveText('YASQ');
    await expect(header.gameSettingsBtn).not.toBeVisible();

    // But is not true on the playing page
    await session.api.patchState({ phase: GamePhase.PLAYING });
    await playingPage.gameArena.waitFor();

    await expect(header.title).not.toHaveText('YASQ');
    await expect(header.gameSettingsBtn).toBeVisible();
  });

  test('should allow opening local settings modal and changing preferences', async ({
    page,
    header,
    localSettingsModal,
  }) => {
    await expect(localSettingsModal.modal).toBeHidden();

    // Open local settings modal
    await header.localSettingsBtn.click();
    await expect(localSettingsModal.modal).toBeVisible();
    await expect(localSettingsModal.title).toContainText('Local Settings');

    // Change theme
    await localSettingsModal.setTheme('light');
    expect(await page.locator('html').getAttribute('data-theme')).toEqual('light');

    await localSettingsModal.setTheme('dark');
    expect(await page.locator('html').getAttribute('data-theme')).toEqual('dark');

    // Change keyboard hints
    await localSettingsModal.setKeyboardHints(false);
    expect(await page.locator('html').getAttribute('data-keyboard-hints')).toEqual('false');

    await localSettingsModal.setKeyboardHints(true);
    expect(await page.locator('html').getAttribute('data-keyboard-hints')).toEqual('true');

    // Close local settings modal
    await localSettingsModal.closeBtn.click();
    await expect(localSettingsModal.modal).toBeHidden();
  });

  test('should allow opening the how-to-play modal and switching between tabs', async ({ header, howToPlayModal }) => {
    await expect(howToPlayModal.modal).toBeHidden();

    await expect(header.howToPlayBtn).toBeVisible();
    await header.howToPlayBtn.click();

    // How to play modal opened
    await expect(howToPlayModal.modal).toBeVisible();
    await expect(howToPlayModal.title).toContainText('How to Play');
    await expect(howToPlayModal.hostTabLabel).toBeVisible();
    await expect(howToPlayModal.playerTabLabel).toBeVisible();

    // Can switch to player tab (no assumption about the initially open tab here)
    await howToPlayModal.openPlayerTab();
    await expect(howToPlayModal.playerTabLabel).toHaveClass(/\bactive\b/);
    await expect(howToPlayModal.hostTabLabel).not.toHaveClass(/\bactive\b/);
    await howToPlayModal.expectTabToBeOpen('player');

    // Can switch to host tab
    await howToPlayModal.openHostTab();
    await expect(howToPlayModal.hostTabLabel).toHaveClass(/\bactive\b/);
    await expect(howToPlayModal.playerTabLabel).not.toHaveClass(/\bactive\b/);
    await howToPlayModal.expectTabToBeOpen('host');

    // Modal disappears on close
    await howToPlayModal.closeBtn.click();
    await expect(howToPlayModal.modal).toBeHidden();
  });

  test('should display the most relevant tab first upon opening the how-to-play modal', async ({
    header,
    howToPlayModal,
    session,
  }) => {
    await session.client.switchUser(0); // ensure we are host (ID 0)

    await expect(howToPlayModal.modal).not.toBeVisible();
    await header.howToPlayBtn.click();
    await expect(howToPlayModal.modal).toBeVisible();

    // Initialized modal with the host tab open, since we are the host
    await expect(howToPlayModal.hostTabLabel).toHaveClass(/\bactive\b/);
    await expect(howToPlayModal.playerTabLabel).not.toHaveClass(/\bactive\b/);
    await howToPlayModal.expectTabToBeOpen('host');

    await howToPlayModal.closeBtn.click();
    await expect(howToPlayModal.modal).toBeHidden();

    await session.client.switchUser(1); // switch to Player 1's view

    await expect(howToPlayModal.modal).not.toBeVisible();
    await header.howToPlayBtn.click();
    await expect(howToPlayModal.modal).toBeVisible();

    // Initialized modal with the player tab open, since we are a player
    await expect(howToPlayModal.modal).toBeVisible();
    await expect(howToPlayModal.playerTabLabel).toHaveClass(/\bactive\b/);
    await expect(howToPlayModal.hostTabLabel).not.toHaveClass(/\bactive\b/);
    await howToPlayModal.expectTabToBeOpen('player');
  });
});

test.describe('In-Game', () => {
  const CURRENT_ROUND = 3;
  const CUSTOM_SETTINGS = {
    rounds: 12,
    maxGuessTime: 50_000,
    timeBonus: TimeBonus.LOGISTIC,
    firstBonusMultiplier: FirstBonusMultiplier.SMALL,
    streakBonusMultiplier: StreakBonusMultiplier.LARGE,
    enabledJokers: [Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
    achievementBonuses: {
      mode: AchievementBonusMode.RANDOM,
      randomCount: 2,
    },
  };

  test.use({
    sessionConfig: {
      sessionData: {
        state: {
          game: 1,
          round: CURRENT_ROUND,
          phase: GamePhase.ROUND_RESULTS,
        },
        settings: CUSTOM_SETTINGS,
      },
    },
  });

  test('should display the current round and game settings button during a running game', async ({
    header,
    session,
  }) => {
    await expect(header.title).toContainText(`Round ${CURRENT_ROUND} of ${CUSTOM_SETTINGS.rounds}`);

    await expect(header.gameSettingsBtn).toBeVisible();
    await expect(header.gameSettingsBtn).toBeEnabled();

    // The other header buttons are also there
    await expect(header.howToPlayBtn).toBeVisible();
    await expect(header.howToPlayBtn).toBeEnabled();

    await expect(header.localSettingsBtn).toBeVisible();
    await expect(header.localSettingsBtn).toBeEnabled();

    // Change current round
    const newCurrentRound = 5;
    expect(newCurrentRound).not.toBe(CURRENT_ROUND);
    await session.api.patchState({ round: newCurrentRound });
    await expect(header.title).toContainText(`Round ${newCurrentRound} of ${CUSTOM_SETTINGS.rounds}`);

    // Change game settings
    const newTotalRounds = 24;
    expect(newTotalRounds).not.toBe(CUSTOM_SETTINGS.rounds);
    await session.api.patchSettings({ rounds: newTotalRounds });
    await expect(header.title).toContainText(`Round ${newCurrentRound} of ${newTotalRounds}`);

    // Change to another in-game view
    const viewPairs = [
      [1, GamePhase.TRACK_SELECTION],
      [2, GamePhase.PLAYING],
      [3, GamePhase.HOST_REVIEW],
    ] as const;
    for (const [round, phase] of viewPairs) {
      await session.api.patchState({ round, phase });
      await expect(header.title).toContainText(`Round ${round} of ${newTotalRounds}`);
    }
  });

  test('should display the current game settings in the game settings modal', async ({ header, gameSettingsModal }) => {
    await expect(gameSettingsModal.modal).toBeHidden();

    await header.gameSettingsBtn.click();

    await expect(gameSettingsModal.modal).toBeVisible();
    await expect(gameSettingsModal.roundsDisplay).toBeVisible();
    await expect(gameSettingsModal.title).toContainText('Game Settings');

    await expect(gameSettingsModal.roundsDisplay).toHaveText(CUSTOM_SETTINGS.rounds.toString());
    await expect(gameSettingsModal.guessTimeDisplay).toHaveText(`${CUSTOM_SETTINGS.maxGuessTime / 1000}s`);

    const displayedJokers = await gameSettingsModal.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual(Array.from(CUSTOM_SETTINGS.enabledJokers).sort());
    await expect(gameSettingsModal.timeBonusDisplay).toContainText(
      EXPECTED_TIME_BONUS_LABELS[CUSTOM_SETTINGS.timeBonus]
    );

    await expect(gameSettingsModal.firstBonusDisplay).toHaveText(toBonusPercent(CUSTOM_SETTINGS.firstBonusMultiplier));
    await expect(gameSettingsModal.streakBonusDisplay).toHaveText(
      toBonusPercent(CUSTOM_SETTINGS.streakBonusMultiplier)
    );
    await expect(gameSettingsModal.achievementModeDisplay).toHaveText(
      `Random (${CUSTOM_SETTINGS.achievementBonuses.randomCount})`
    );
  });
});
