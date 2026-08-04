import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from '../utils/helper.js';
import { SetupPage } from './pages/SetupPage.js';
import { TestApi } from '../utils/api.js';
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  DEFAULT_TRACK_DURATION,
  Joker,
} from '../../shared';

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

  test('should contain default settings on startup', async ({ page }) => {
    const setup = new SetupPage(page);

    // Verify initial UI state
    await expect(setup.hostSettings).toBeVisible();
    await expect(setup.advancedSettings).toBeHidden();
    await expect(setup.advancedSettingsToggle).toBeVisible();

    const jokerButtons = await setup.getAllJokerButtons();
    expect(jokerButtons.length).toEqual(Object.values(Joker).length); // as many buttons as joker variants
    for (const button of jokerButtons) {
      await expect(button).toBeEnabled();
    }

    await expect(setup.startBtn).toBeVisible();
    await expect(setup.startBtn).toBeEnabled();

    await expect(setup.hostTransferDropdownBtn).toBeVisible();
    await expect(setup.hostTransferDropdownBtn).toBeEnabled();
    await expect(setup.hostTransferConfirmBtn).toBeVisible();
    await expect(setup.hostTransferConfirmBtn).toBeDisabled();
    await expect(setup.hostTransferList).toBeHidden();
    await expect(setup.hostTransferDropdownBtn).toContainText('Select a player...');

    // Verify controls are initialized with the global default values
    await expect(setup.roundsInput).toHaveValue(DEFAULT_ROUNDS.toString());
    await expect(setup.trackDurationInput).toHaveValue((DEFAULT_TRACK_DURATION / 1000).toString());

    // Exactly the default-enabled jokers are active
    const enabledJokers = await setup.getEnabledJokerButtons();
    expect(enabledJokers).toHaveLength(DEFAULT_ENABLED_JOKERS.length);
    const enabledJokerTypes = await setup.getEnabledJokerTypes();
    expect(enabledJokerTypes).toEqual(expect.arrayContaining(DEFAULT_ENABLED_JOKERS));

    await setup.advancedSettingsToggle.click();
    await expect(setup.advancedSettings).toBeVisible();

    await expect(setup.timeBonusSelect).toBeVisible();
    const selectedTimeBonus = await setup.timeBonusSelect.inputValue();
    expect(selectedTimeBonus).toEqual(DEFAULT_TIME_BONUS.toString());

    expect(await setup.getActiveFirstBonus()).toEqual(DEFAULT_FIRST_BONUS_MULTIPLIER.toString());
    expect(await setup.getActiveStreakBonus()).toEqual(DEFAULT_STREAK_BONUS_MULTIPLIER.toString());
  });

  test('should allow host to select another player and transfer host role', async ({ page }) => {
    const setup = new SetupPage(page);
    const targetPlayer = players[2];

    await expect(setup.hostSettings).toBeVisible();
    await expect(setup.waitingMsg).toBeHidden();

    // Open the dropdown
    await setup.hostTransferDropdownBtn.click();
    await expect(setup.hostTransferList).toBeVisible();

    // Select the target player from the list
    await setup.getPlayerItem(targetPlayer.id).click();

    // Verify selection state
    await expect(setup.hostTransferList).toBeHidden();
    await expect(setup.hostTransferConfirmBtn).toBeEnabled();

    // Verify the header updated with the selected player's name
    await expect(setup.hostTransferDropdownBtn).toContainText(targetPlayer.username);

    // Execute the transfer
    await setup.hostTransferConfirmBtn.click();
    await expect(setup.hostTransferConfirmBtn).toHaveText(/transferring/i);

    // Verify UI transition to the player UI
    await expect(setup.hostSettings).toBeHidden();
    await expect(setup.waitingMsg).toBeVisible();
  });

  test('should allow host to configure game and transfer host using only keyboard', async ({ page }) => {
    const setup = new SetupPage(page);
    await expect(setup.hostSettings).toBeVisible();

    // Configure rounds
    await setup.roundsInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('5');

    // Configure track duration
    await page.keyboard.press('Tab');
    await expect(setup.trackDurationInput).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('30');

    // Move through joker buttons
    await page.keyboard.press('Tab'); // first joker
    await expect(setup.firstJoker).toBeFocused();
    await expect(setup.firstJoker).toHaveClass(/\bactive\b/);
    await expect(setup.firstJoker).not.toHaveClass(/\binactive\b/);
    await page.keyboard.press('Space'); // toggle it
    await expect(setup.firstJoker).toHaveClass(/\binactive\b/);
    await expect(setup.firstJoker).not.toHaveClass(/\bactive\b/);

    // Continue tabbing until Advanced Settings button
    await setup.tabUntilFocused(setup.advancedSettingsToggle);

    // Open advanced settings
    await page.keyboard.press('Enter');

    // Time bonus select
    await page.keyboard.press('Tab');
    const previousValue = await setup.timeBonusSelect.inputValue();
    await page.keyboard.press('ArrowDown');
    const newValue = await setup.timeBonusSelect.inputValue();
    expect(newValue).not.toBe(previousValue);

    // First bonus radio buttons
    await page.keyboard.press('Tab');
    const checkedBefore = await setup.getActiveFirstBonus();
    await page.keyboard.press('ArrowRight');
    const checkedAfter = await setup.getActiveFirstBonus();
    expect(checkedAfter).not.toBe(checkedBefore);

    // Continue until Confirm button
    await setup.tabUntilFocused(setup.startBtn);
    await expect(setup.startBtn).toBeFocused();

    // Continue to host transfer dropdown
    await page.keyboard.press('Tab');
    await expect(setup.hostTransferDropdownBtn).toBeFocused();

    // Open dropdown
    await page.keyboard.press('Enter');
    await expect(setup.hostTransferList).toBeVisible();

    // Wait until first element is focussed
    const firstItem = setup.getPlayerItem(players[1].id);
    await expect(firstItem).toBeFocused();

    // Navigate to third player (players[2])
    await page.keyboard.press('ArrowDown');
    const targetItem = setup.getPlayerItem(players[2].id);
    await expect(targetItem).toBeFocused();

    // Select player
    await page.keyboard.press('Enter');
    await expect(setup.hostTransferList).toBeHidden();
    await expect(setup.hostTransferDropdownBtn).toContainText(players[2].username);

    // Transfer button
    await page.keyboard.press('Tab');
    await expect(setup.hostTransferConfirmBtn).toBeFocused();
    await expect(setup.hostTransferConfirmBtn).toBeEnabled();

    // Execute transfer
    await page.keyboard.press('Enter');
    await expect(setup.hostTransferConfirmBtn).toHaveText(/transferring/i);

    // Host becomes non-host
    await expect(setup.hostSettings).toBeHidden();
    await expect(setup.waitingMsg).toBeVisible();
  });
});
