import { expect, test } from './test_setup.js';
import { EXPECTED_TIME_BONUS_LABELS, toBonusPercent } from '../utils/helper.js';
import {
  FirstBonusMultiplier,
  GameState,
  Joker,
  sortByEnumOrder,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

const CUSTOM_SETTINGS = {
  rounds: 14,
  maxGuessTime: 50_000,
  timeBonus: TimeBonus.LOGISTIC,
  firstBonusMultiplier: FirstBonusMultiplier.OFF,
  streakBonusMultiplier: StreakBonusMultiplier.LARGE,
  enabledJokers: [Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
};

test.use({
  sessionConfig: {
    state: GameState.LOBBY,
    playerCount: 3,
    userIndex: 0,
    sessionData: { settings: CUSTOM_SETTINGS },
  },
});

test.describe('Host UI', () => {
  test('should initialize setup view with settings from lobby view when editing settings', async ({
    setupPage,
    lobbyPage,
  }) => {
    // Assert that all settings are accurately displayed on the LobbyView
    await expect(lobbyPage.settingsSummary).toBeVisible();
    await expect(lobbyPage.roundsDisplay).toHaveText(CUSTOM_SETTINGS.rounds.toString());
    await expect(lobbyPage.guessTimeDisplay).toHaveText(`${CUSTOM_SETTINGS.maxGuessTime / 1000}s`);

    const displayedJokers = await lobbyPage.getEnabledJokerTypes();
    expect(displayedJokers.sort()).toEqual([...CUSTOM_SETTINGS.enabledJokers].sort());

    const expectedFirstBonus =
      CUSTOM_SETTINGS.firstBonusMultiplier === FirstBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(CUSTOM_SETTINGS.firstBonusMultiplier);
    const expectedStreakBonus =
      CUSTOM_SETTINGS.streakBonusMultiplier === StreakBonusMultiplier.OFF
        ? 'Off'
        : toBonusPercent(CUSTOM_SETTINGS.streakBonusMultiplier);

    await expect(lobbyPage.timeBonusDisplay).toContainText(EXPECTED_TIME_BONUS_LABELS[CUSTOM_SETTINGS.timeBonus]);
    await expect(lobbyPage.firstBonusDisplay).toHaveText(expectedFirstBonus);
    await expect(lobbyPage.streakBonusDisplay).toHaveText(expectedStreakBonus);

    // Click edit settings to transition back to SetupView
    await lobbyPage.editBtn.click();
    await expect(setupPage.hostSettings).toBeVisible();

    // Assert basic settings are pre-filled correctly
    await expect(setupPage.roundsInput).toHaveValue(CUSTOM_SETTINGS.rounds.toString());
    await expect(setupPage.maxGuessTimeInput).toHaveValue((CUSTOM_SETTINGS.maxGuessTime / 1000).toString());

    const enabledJokers = new Set(await setupPage.getEnabledJokerTypes());
    expect(enabledJokers).toEqual(new Set(CUSTOM_SETTINGS.enabledJokers));

    // Check Advanced Settings
    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();

    expect(await setupPage.getActiveTimeBonus()).toEqual(CUSTOM_SETTINGS.timeBonus.toString());
    expect(await setupPage.getActiveFirstBonus()).toEqual(CUSTOM_SETTINGS.firstBonusMultiplier.toString());
    expect(await setupPage.getActiveStreakBonus()).toEqual(CUSTOM_SETTINGS.streakBonusMultiplier.toString());
  });

  test('should keep the same order in the enabled jokers list when jokers are toggled', async ({
    setupPage,
    lobbyPage,
  }) => {
    test.setTimeout(60_000);

    let displayedJokers: Joker[];

    async function editJokersAndSwitchBack(targetJokers: Joker[]) {
      await expect(lobbyPage.settingsSummary).toBeVisible();
      await lobbyPage.editBtn.click();
      await expect(setupPage.hostSettings).toBeVisible();
      await setupPage.setEnabledJokers(targetJokers);
      await setupPage.startBtn.click();
      await expect(lobbyPage.settingsSummary).toBeVisible();
    }

    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.TRIVIA, Joker.GLIMPSE, Joker.MULTIPLE_CHOICE]);
    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE, Joker.OBFUSCATION]);
    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.SPY]);
    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([Joker.SPY, Joker.MULTIPLE_CHOICE, Joker.OBFUSCATION]);
    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));

    await editJokersAndSwitchBack([]);
    await editJokersAndSwitchBack(Object.values(Joker));
    displayedJokers = (await lobbyPage.getEnabledJokerTypes()) as Joker[];
    expect(displayedJokers).toEqual([...displayedJokers].sort(sortByEnumOrder(Joker)));
  });
});
