import { expect, test } from '@playwright/test';
import { EXPECTED_TIME_BONUS_LABELS, generatePlayers, Player, toBonusPercent } from '../utils/helper.js';
import { SetupPage } from './pages/SetupPage.js';
import { TestApi } from '../utils/api.js';
import { LobbyPage } from './pages/LobbyPage';
import { FirstBonusMultiplier, Joker, StreakBonusMultiplier, TimeBonus } from '@yasq/shared';

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
    await api.setupSession(players, 'LOBBY');

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should initialize setup view with settings from lobby view when editing settings', async ({ page }) => {
    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);

    const CUSTOM_SETTINGS = {
      rounds: 14,
      trackDuration: 50_000,
      timeBonus: TimeBonus.LOGISTIC,
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      streakBonusMultiplier: StreakBonusMultiplier.LARGE,
      enabledJokers: [Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
    };

    // Re-setup session in LOBBY state with custom settings and reload
    await api.setupSession(players, 'LOBBY', { settings: CUSTOM_SETTINGS });
    await page.goto('/?mock=true');

    // Assert that all settings are accurately displayed on the LobbyView
    await expect(lobby.settingsSummary).toBeVisible();
    await expect(lobby.roundsDisplay).toHaveText(CUSTOM_SETTINGS.rounds.toString());
    await expect(lobby.durationDisplay).toHaveText(`${CUSTOM_SETTINGS.trackDuration / 1000}s`);

    const displayedJokers = await lobby.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual([...CUSTOM_SETTINGS.enabledJokers].sort());

    const expectedFirstBonus =
      CUSTOM_SETTINGS.firstBonusMultiplier === FirstBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(CUSTOM_SETTINGS.firstBonusMultiplier);
    const expectedStreakBonus =
      CUSTOM_SETTINGS.streakBonusMultiplier === StreakBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(CUSTOM_SETTINGS.streakBonusMultiplier);

    await expect(lobby.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[CUSTOM_SETTINGS.timeBonus]);
    await expect(lobby.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobby.streakBonusDisplay).toHaveText(expectedStreakBonus);

    // Click edit settings to transition back to SetupView
    await lobby.editBtn.click();
    await expect(setup.hostSettings).toBeVisible();

    // Assert basic settings are pre-filled correctly
    await expect(setup.roundsInput).toHaveValue(CUSTOM_SETTINGS.rounds.toString());
    await expect(setup.trackDurationInput).toHaveValue((CUSTOM_SETTINGS.trackDuration / 1000).toString());

    const enabledJokers = new Set(await setup.getEnabledJokerTypes());
    expect(enabledJokers).toEqual(new Set(CUSTOM_SETTINGS.enabledJokers));

    // Advanced Settings
    await setup.advancedSettingsToggle.click();
    await expect(setup.advancedSettings).toBeVisible();

    expect(await setup.getActiveTimeBonus()).toEqual(CUSTOM_SETTINGS.timeBonus.toString());
    expect(await setup.getActiveFirstBonus()).toEqual(CUSTOM_SETTINGS.firstBonusMultiplier.toString());
    expect(await setup.getActiveStreakBonus()).toEqual(CUSTOM_SETTINGS.streakBonusMultiplier.toString());
  });
});
