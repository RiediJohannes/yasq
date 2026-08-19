import { expect, test } from './test_setup.js';
import { EXPECTED_TIME_BONUS_LABELS, toBonusPercent } from '../utils/helper.js';
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  DEFAULT_TRACK_DURATION,
  FirstBonusMultiplier,
  GameState,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

test.use({
  sessionConfig: {
    state: GameState.SETUP,
    playerCount: 3,
  },
});

test.describe('Host UI', () => {
  test('should persist settings across transition to the lobby', async ({ setupPage, lobbyPage }) => {
    const ROUNDS = 12;
    const TRACK_DURATION = 45;
    const TIME_BONUS = TimeBonus.EXPONENTIAL;
    const FIRST_BONUS = FirstBonusMultiplier.LARGE;
    const STREAK_BONUS = StreakBonusMultiplier.OFF;
    const ENABLED_JOKERS = new Set([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE]);

    await expect(setupPage.hostSettings).toBeVisible();

    // Change all settings to some non-default values
    await expect(setupPage.roundsInput).not.toHaveValue(ROUNDS.toString());
    await setupPage.roundsInput.fill(ROUNDS.toString());

    await expect(setupPage.trackDurationInput).not.toHaveValue(TRACK_DURATION.toString());
    await setupPage.trackDurationInput.fill(TRACK_DURATION.toString());

    expect(await setupPage.getEnabledJokerTypes()).toEqual(DEFAULT_ENABLED_JOKERS);
    expect(new Set(await setupPage.getEnabledJokerTypes())).not.toEqual(ENABLED_JOKERS);
    await setupPage.setEnabledJokers(ENABLED_JOKERS);
    expect(new Set(await setupPage.getEnabledJokerTypes())).toEqual(ENABLED_JOKERS);

    // Advanced Settings
    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();
    await expect(setupPage.timeBonusSelect).toBeVisible();

    expect(await setupPage.getActiveTimeBonus()).not.toEqual(TIME_BONUS.toString());
    await setupPage.setTimeBonus(TIME_BONUS);

    expect(await setupPage.getActiveFirstBonus()).not.toEqual(FIRST_BONUS.toString());
    await setupPage.setFirstBonus(FIRST_BONUS);

    expect(await setupPage.getActiveStreakBonus()).not.toEqual(STREAK_BONUS.toString());
    await setupPage.setStreakBonus(STREAK_BONUS);

    // Confirm settings and wait for transition to LobbyView
    await setupPage.startBtn.click();
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(lobbyPage.settingsSummary).toBeVisible();
    await expect(lobbyPage.roundsDisplay).toBeVisible();

    // Assert that the Lobby displays the exact settings we just configured
    await expect(lobbyPage.roundsDisplay).toHaveText(ROUNDS.toString());
    await expect(lobbyPage.durationDisplay).toHaveText(`${TRACK_DURATION}s`);

    // Compare enabled jokers as sorted arrays to also catch potential duplicates in the displayed list
    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual(Array.from(ENABLED_JOKERS).sort());

    const expectedFirstBonus =
      (FIRST_BONUS as FirstBonusMultiplier) === FirstBonusMultiplier.OFF ? 'Off' : toBonusPercent(FIRST_BONUS);
    const expectedStreakBonus =
      (STREAK_BONUS as StreakBonusMultiplier) === StreakBonusMultiplier.OFF ? 'Off' : toBonusPercent(STREAK_BONUS);
    await expect(lobbyPage.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[TIME_BONUS]);
    await expect(lobbyPage.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobbyPage.streakBonusDisplay).toHaveText(expectedStreakBonus);
  });

  test('should display default settings when settings are immediately confirmed', async ({ setupPage, lobbyPage }) => {
    await expect(setupPage.hostSettings).toBeVisible();

    // Confirm default settings without changing anything
    await setupPage.startBtn.click();
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(lobbyPage.settingsSummary).toBeVisible();
    await expect(lobbyPage.roundsDisplay).toBeVisible();

    // Assert that default settings are correctly rendered in the lobby
    await expect(lobbyPage.roundsDisplay).toHaveText(DEFAULT_ROUNDS.toString());
    await expect(lobbyPage.durationDisplay).toHaveText(`${DEFAULT_TRACK_DURATION / 1000}s`);

    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual([...DEFAULT_ENABLED_JOKERS].sort());

    const expectedFirstBonus =
      (DEFAULT_FIRST_BONUS_MULTIPLIER as FirstBonusMultiplier) === FirstBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(DEFAULT_FIRST_BONUS_MULTIPLIER);
    const expectedStreakBonus =
      (DEFAULT_STREAK_BONUS_MULTIPLIER as StreakBonusMultiplier) === StreakBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(DEFAULT_STREAK_BONUS_MULTIPLIER);
    await expect(lobbyPage.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[DEFAULT_TIME_BONUS]);
    await expect(lobbyPage.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobbyPage.streakBonusDisplay).toHaveText(expectedStreakBonus);
  });

  test('should correctly handle an empty set of enabled jokers', async ({ setupPage, lobbyPage }) => {
    await expect(setupPage.hostSettings).toBeVisible();

    // Disable all jokers
    await setupPage.setEnabledJokers(new Set());
    expect(await setupPage.getEnabledJokerTypes()).toEqual([]);

    // Confirm settings and wait for transition to LobbyView
    await setupPage.startBtn.click();
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(lobbyPage.settingsSummary).toBeVisible();

    // Assert that no jokers are displayed in the lobby
    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers).toEqual([]);
    await expect(lobbyPage.jokersContainer).toContainText('None');

    // Transition back to the setup page
    await expect(lobbyPage.editBtn).toBeEnabled();
    await lobbyPage.editBtn.click();
    await expect(lobbyPage.settingsSummary).toBeHidden();
    await expect(setupPage.hostSettings).toBeVisible();

    // Verify that no joker is enabled
    expect(await setupPage.getEnabledJokerTypes()).toEqual([]);
  });
});
