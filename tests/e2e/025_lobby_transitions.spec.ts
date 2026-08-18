import { expect, test } from '@playwright/test';
import { EXPECTED_TIME_BONUS_LABELS, generatePlayers, Player, toBonusPercent } from '../utils/helper.js';
import { SetupPage } from './pages/SetupPage.js';
import { TestApi } from '../utils/api.js';
import { LobbyPage } from './pages/LobbyPage';
import { FirstBonusMultiplier, Joker, sortByEnumOrder, StreakBonusMultiplier, TimeBonus } from '@yasq/shared';

test.describe('Host UI', () => {
  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  const CUSTOM_SETTINGS = {
    rounds: 14,
    trackDuration: 50_000,
    timeBonus: TimeBonus.LOGISTIC,
    firstBonusMultiplier: FirstBonusMultiplier.OFF,
    streakBonusMultiplier: StreakBonusMultiplier.LARGE,
    enabledJokers: [Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
  };

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
    await api.setupSession(players, 'LOBBY', { settings: CUSTOM_SETTINGS });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should initialize setup view with settings from lobby view when editing settings', async ({ page }) => {
    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);

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

    // Check Advanced Settings
    await setup.advancedSettingsToggle.click();
    await expect(setup.advancedSettings).toBeVisible();

    expect(await setup.getActiveTimeBonus()).toEqual(CUSTOM_SETTINGS.timeBonus.toString());
    expect(await setup.getActiveFirstBonus()).toEqual(CUSTOM_SETTINGS.firstBonusMultiplier.toString());
    expect(await setup.getActiveStreakBonus()).toEqual(CUSTOM_SETTINGS.streakBonusMultiplier.toString());
  });

  test('should keep the same order in the enabled jokers list when jokers are toggled', async ({ page }) => {
    test.setTimeout(60_000);

    const setup = new SetupPage(page);
    const lobby = new LobbyPage(page);
    let displayedJokers: Joker[];

    async function editJokersAndSwitchBack(targetJokers: Joker[]) {
      await expect(lobby.settingsSummary).toBeVisible();
      await lobby.editBtn.click();
      await expect(setup.hostSettings).toBeVisible();
      await setup.setEnabledJokers(targetJokers);
      await setup.startBtn.click();
      await expect(lobby.settingsSummary).toBeVisible();
    }

    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker))); // sorting the array should have no effect

    await editJokersAndSwitchBack([Joker.TRIVIA, Joker.GLIMPSE, Joker.MULTIPLE_CHOICE]);
    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE, Joker.OBFUSCATION]);
    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.SPY]);
    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.SPY, Joker.MULTIPLE_CHOICE, Joker.OBFUSCATION]);
    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([]);
    await editJokersAndSwitchBack(Object.values(Joker));
    displayedJokers = (await lobby.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));
  });
});
