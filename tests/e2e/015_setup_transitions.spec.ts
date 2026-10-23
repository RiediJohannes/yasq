import { expect, test } from './test_setup.js';
import { EXPECTED_TIME_BONUS_LABELS, toBonusPercent } from '../utils/helper.js';
import {
  AchievementBonusMode,
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_MAX_GUESS_TIME,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  FirstBonusMultiplier,
  GamePhase,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

test.use({
  sessionConfig: {
    playerCount: 3,
    sessionData: {
      state: { phase: GamePhase.SETUP },
    },
  },
});

test.describe('Host UI', () => {
  test('should persist settings across transition to the lobby', async ({ setupPage, lobbyPage }) => {
    const ROUNDS = 12;
    const MAX_GUESS_TIME = 45;
    const TIME_BONUS = TimeBonus.EXPONENTIAL;
    const FIRST_BONUS = FirstBonusMultiplier.LARGE;
    const STREAK_BONUS = StreakBonusMultiplier.SMALL;
    const ENABLED_JOKERS = new Set([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE]);
    const ACHIEVEMENT_BONUS_MODE = 'random' as AchievementBonusMode;

    await expect(setupPage.hostSettings).toBeVisible();

    // Change all settings to some non-default values
    await expect(setupPage.roundsInput).not.toHaveValue(ROUNDS.toString());
    await setupPage.roundsInput.fill(ROUNDS.toString());

    await expect(setupPage.maxGuessTimeInput).not.toHaveValue(MAX_GUESS_TIME.toString());
    await setupPage.maxGuessTimeInput.fill(MAX_GUESS_TIME.toString());

    expect(await setupPage.getEnabledJokerTypes()).toEqual(DEFAULT_ENABLED_JOKERS);
    expect(new Set(await setupPage.getEnabledJokerTypes())).not.toEqual(ENABLED_JOKERS);
    await setupPage.setEnabledJokers(ENABLED_JOKERS);
    expect(new Set(await setupPage.getEnabledJokerTypes())).toEqual(ENABLED_JOKERS);

    // Advanced Settings
    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();

    expect(await setupPage.getActiveTimeBonus()).not.toEqual(TIME_BONUS.toString());
    await setupPage.setTimeBonus(TIME_BONUS);

    expect(await setupPage.getActiveFirstBonus()).not.toEqual(FIRST_BONUS.toString());
    await setupPage.setFirstBonus(FIRST_BONUS);

    expect(await setupPage.getActiveStreakBonus()).not.toEqual(STREAK_BONUS.toString());
    await setupPage.setStreakBonus(STREAK_BONUS);

    expect(await setupPage.getActiveAchievementMode()).not.toEqual(ACHIEVEMENT_BONUS_MODE);
    await setupPage.setAchievementMode(ACHIEVEMENT_BONUS_MODE);
    await setupPage.achievementRandomInput.fill('1');

    // Confirm settings and wait for transition to LobbyView
    await setupPage.startBtn.click();
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(lobbyPage.settingsSummary).toBeVisible();
    await expect(lobbyPage.roundsDisplay).toBeVisible();

    // Assert that the Lobby displays the exact settings we just configured
    await expect(lobbyPage.roundsDisplay).toHaveText(ROUNDS.toString());
    await expect(lobbyPage.guessTimeDisplay).toHaveText(`${MAX_GUESS_TIME}s`);

    // Compare enabled jokers as sorted arrays to also catch potential duplicates in the displayed list
    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    await expect(displayedJokers.sort()).toEqual(Array.from(ENABLED_JOKERS).sort());
    await expect(lobbyPage.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[TIME_BONUS]);
    await expect(lobbyPage.firstBonusDisplay).toHaveText(toBonusPercent(FIRST_BONUS));
    await expect(lobbyPage.streakBonusDisplay).toHaveText(toBonusPercent(STREAK_BONUS));
    await expect(lobbyPage.achievementModeDisplay).toHaveText(/Random/i);
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
    await expect(lobbyPage.guessTimeDisplay).toHaveText(`${DEFAULT_MAX_GUESS_TIME / 1000}s`);

    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual([...DEFAULT_ENABLED_JOKERS].sort());
    await expect(lobbyPage.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[DEFAULT_TIME_BONUS]);
    await expect(lobbyPage.firstBonusDisplay).toHaveText(toBonusPercent(DEFAULT_FIRST_BONUS_MULTIPLIER));
    await expect(lobbyPage.streakBonusDisplay).toHaveText(toBonusPercent(DEFAULT_STREAK_BONUS_MULTIPLIER));
    await expect(lobbyPage.achievementModeDisplay).toHaveText(/Fastest Correct Guess|Highest Streak/i);
  });

  test('should correctly handle disabled settings', async ({ setupPage, lobbyPage }) => {
    await expect(setupPage.hostSettings).toBeVisible();

    // Open Advanced Settings
    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();

    // Disable all optional settings
    await setupPage.setEnabledJokers(new Set());
    await setupPage.setTimeBonus('❌ No time bonus');
    await setupPage.setFirstBonus(FirstBonusMultiplier.OFF);
    await setupPage.setStreakBonus(StreakBonusMultiplier.OFF);
    await setupPage.setAchievementMode('off');

    // Confirm settings and wait for transition to LobbyView
    await setupPage.startBtn.click();
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(lobbyPage.settingsSummary).toBeVisible();

    // Assert that all optional settings are disabled in the lobby
    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers).toEqual([]);
    await expect(lobbyPage.jokersContainer).toContainText('None');
    await expect(lobbyPage.timeBonusDisplay).toContainText('None');
    await expect(lobbyPage.firstBonusDisplay).toContainText('None');
    await expect(lobbyPage.streakBonusDisplay).toContainText('None');
    await expect(lobbyPage.achievementModeDisplay).toContainText('None');

    // Transition back to the setup page
    await expect(lobbyPage.editBtn).toBeEnabled();
    await lobbyPage.editBtn.click();
    await expect(lobbyPage.settingsSummary).toBeHidden();
    await expect(setupPage.hostSettings).toBeVisible();

    // Open Advanced Settings
    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();

    // Verify that no optional is enabled
    expect(await setupPage.getEnabledJokerTypes()).toEqual([]);
    expect(await setupPage.getActiveTimeBonus()).toEqual('NONE');
    expect(Number(await setupPage.getActiveFirstBonus())).toEqual(FirstBonusMultiplier.OFF);
    expect(Number(await setupPage.getActiveStreakBonus())).toEqual(StreakBonusMultiplier.OFF);
    expect(await setupPage.getActiveAchievementMode()).toEqual('off');
  });
});
