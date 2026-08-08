import { expect, test } from '@playwright/test';
import { EXPECTED_TIME_BONUS_LABELS, generatePlayers, Player, toBonusPercent } from '../utils/helper.js';
import { SetupPage } from './pages/SetupPage.js';
import { TestApi } from '../utils/api.js';
import { LobbyPage } from './pages/LobbyPage';
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  DEFAULT_TRACK_DURATION,
  FirstBonusMultiplier,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

test.describe('Host UI', () => {
  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 3;
    players = generatePlayers(playerCount);
    const user = players[0];

    await page.addInitScript(
      ({ allPlayers, user, instanceId }) => {
        window.__MOCK_PARTICIPANTS__ = allPlayers;
        window.__MOCK_USER_ID__ = user.id;
        window.__MOCK_USER_NAME__ = user.username;
        window.__MOCK_INSTANCE_ID__ = instanceId;
      },
      { allPlayers: players, user: user, instanceId: currentInstanceId }
    );

    // Setup current game state
    api = new TestApi('http://localhost:3001', currentInstanceId);
    await api.setupSession(players, 'SETUP');

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should persist settings across transition to the lobby', async ({ page }) => {
    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);

    const ROUNDS = 12;
    const TRACK_DURATION = 45;
    const TIME_BONUS = TimeBonus.EXPONENTIAL;
    const FIRST_BONUS = FirstBonusMultiplier.LARGE;
    const STREAK_BONUS = StreakBonusMultiplier.OFF;
    const ENABLED_JOKERS = new Set([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE]);

    await expect(setup.hostSettings).toBeVisible();

    // Change all settings to some non-default values
    await expect(setup.roundsInput).not.toHaveValue(ROUNDS.toString());
    await setup.roundsInput.fill(ROUNDS.toString());

    await expect(setup.trackDurationInput).not.toHaveValue(TRACK_DURATION.toString());
    await setup.trackDurationInput.fill(TRACK_DURATION.toString());

    expect(await setup.getEnabledJokerTypes()).toEqual(DEFAULT_ENABLED_JOKERS);
    expect(new Set(await setup.getEnabledJokerTypes())).not.toEqual(ENABLED_JOKERS);
    await setup.setEnabledJokers(ENABLED_JOKERS);
    expect(new Set(await setup.getEnabledJokerTypes())).toEqual(ENABLED_JOKERS);

    // Advanced Settings
    await setup.advancedSettingsToggle.click();
    await expect(setup.advancedSettings).toBeVisible();
    await expect(setup.timeBonusSelect).toBeVisible();

    expect(await setup.getActiveTimeBonus()).not.toEqual(TIME_BONUS.toString());
    await setup.setTimeBonus(TIME_BONUS);

    expect(await setup.getActiveFirstBonus()).not.toEqual(FIRST_BONUS.toString());
    await setup.setFirstBonus(FIRST_BONUS);

    expect(await setup.getActiveStreakBonus()).not.toEqual(STREAK_BONUS.toString());
    await setup.setStreakBonus(STREAK_BONUS);

    // Confirm settings and wait for transition to LobbyView
    await setup.startBtn.click();
    await expect(setup.hostSettings).toBeHidden();
    await expect(lobby.settingsSummary).toBeVisible();
    await expect(lobby.roundsDisplay).toBeVisible();

    // Assert that the Lobby displays the exact settings we just configured
    await expect(lobby.roundsDisplay).toHaveText(ROUNDS.toString());
    await expect(lobby.durationDisplay).toHaveText(`${TRACK_DURATION}s`);

    // Compare enabled jokers as sorted arrays to also catch potential duplicates in the displayed list
    const displayedJokers = await lobby.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual(Array.from(ENABLED_JOKERS).sort());

    const expectedFirstBonus =
      (FIRST_BONUS as FirstBonusMultiplier) === FirstBonusMultiplier.OFF ? 'Off' : toBonusPercent(FIRST_BONUS);
    const expectedStreakBonus =
      (STREAK_BONUS as StreakBonusMultiplier) === StreakBonusMultiplier.OFF ? 'Off' : toBonusPercent(STREAK_BONUS);
    await expect(lobby.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[TIME_BONUS]);
    await expect(lobby.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobby.streakBonusDisplay).toHaveText(expectedStreakBonus);
  });

  test('should display default settings when settings are immediately confirmed', async ({ page }) => {
    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);

    await expect(setup.hostSettings).toBeVisible();

    // Confirm default settings without changing anything
    await setup.startBtn.click();
    await expect(setup.hostSettings).toBeHidden();
    await expect(lobby.settingsSummary).toBeVisible();
    await expect(lobby.roundsDisplay).toBeVisible();

    // Assert that default settings are correctly rendered in the lobby
    await expect(lobby.roundsDisplay).toHaveText(DEFAULT_ROUNDS.toString());
    await expect(lobby.durationDisplay).toHaveText(`${DEFAULT_TRACK_DURATION / 1000}s`);

    const displayedJokers = await lobby.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual([...DEFAULT_ENABLED_JOKERS].sort());

    const expectedFirstBonus =
      (DEFAULT_FIRST_BONUS_MULTIPLIER as FirstBonusMultiplier) === FirstBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(DEFAULT_FIRST_BONUS_MULTIPLIER);
    const expectedStreakBonus =
      (DEFAULT_STREAK_BONUS_MULTIPLIER as StreakBonusMultiplier) === StreakBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(DEFAULT_STREAK_BONUS_MULTIPLIER);
    await expect(lobby.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[DEFAULT_TIME_BONUS]);
    await expect(lobby.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobby.streakBonusDisplay).toHaveText(expectedStreakBonus);
  });

  test('should correctly handle an empty set of enabled jokers', async ({ page }) => {
    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);

    await expect(setup.hostSettings).toBeVisible();

    // Disable all jokers
    await setup.setEnabledJokers(new Set());
    expect(await setup.getEnabledJokerTypes()).toEqual([]);

    // Confirm settings and wait for transition to LobbyView
    await setup.startBtn.click();
    await expect(setup.hostSettings).toBeHidden();
    await expect(lobby.settingsSummary).toBeVisible();

    // Assert that no jokers are displayed in the lobby
    const displayedJokers = await lobby.getEnabledJokerTypes();
    expect(displayedJokers).toEqual([]);
    await expect(lobby.jokersContainer).toContainText('None');

    // Transition back to the setup page
    await expect(lobby.editBtn).toBeEnabled();
    await lobby.editBtn.click();
    await expect(lobby.settingsSummary).toBeHidden();
    await expect(setup.hostSettings).toBeVisible();

    // Verify that no joker is enabled
    expect(await setup.getEnabledJokerTypes()).toEqual([]);
  });
});
