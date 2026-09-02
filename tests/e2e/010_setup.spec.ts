import { expect, test } from './test_setup.js';
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_MAX_GUESS_TIME,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  GameState,
  Joker,
} from '@yasq/shared';
import AxeBuilder from '@axe-core/playwright';

test.use({
  sessionConfig: {
    state: GameState.SETUP,
    playerCount: 3,
  },
});

test.describe('Host UI', () => {
  test('should contain default settings on startup', async ({ setupPage }) => {
    // Verify initial UI state
    await expect(setupPage.hostSettings).toBeVisible();
    await expect(setupPage.advancedSettings).toBeHidden();
    await expect(setupPage.advancedSettingsToggle).toBeVisible();

    const jokerButtons = await setupPage.getAllJokerButtons();
    expect(jokerButtons.length).toEqual(Object.values(Joker).length);
    for (const button of jokerButtons) {
      await expect(button).toBeEnabled();
    }

    await expect(setupPage.startBtn).toBeVisible();
    await expect(setupPage.startBtn).toBeEnabled();

    await expect(setupPage.hostTransferDropdownBtn).toBeVisible();
    await expect(setupPage.hostTransferDropdownBtn).toBeEnabled();
    await expect(setupPage.hostTransferConfirmBtn).toBeVisible();
    await expect(setupPage.hostTransferConfirmBtn).toBeDisabled();
    await expect(setupPage.hostTransferList).toBeHidden();
    await expect(setupPage.hostTransferDropdownBtn).toContainText('Select a player...');

    // Verify controls are initialized with the global default values
    await expect(setupPage.roundsInput).toHaveValue(DEFAULT_ROUNDS.toString());
    await expect(setupPage.maxGuessTimeInput).toHaveValue((DEFAULT_MAX_GUESS_TIME / 1000).toString());

    // Exactly the default-enabled jokers are active
    const enabledJokers = await setupPage.getEnabledJokerButtons();
    expect(enabledJokers).toHaveLength(DEFAULT_ENABLED_JOKERS.length);
    const enabledJokerTypes = await setupPage.getEnabledJokerTypes();
    expect(enabledJokerTypes).toEqual(expect.arrayContaining(DEFAULT_ENABLED_JOKERS));

    await setupPage.advancedSettingsToggle.click();
    await expect(setupPage.advancedSettings).toBeVisible();

    await expect(setupPage.timeBonusSelect).toBeVisible();
    const selectedTimeBonus = await setupPage.timeBonusSelect.inputValue();
    expect(selectedTimeBonus).toEqual(DEFAULT_TIME_BONUS.toString());

    expect(await setupPage.getActiveFirstBonus()).toEqual(DEFAULT_FIRST_BONUS_MULTIPLIER.toString());
    expect(await setupPage.getActiveStreakBonus()).toEqual(DEFAULT_STREAK_BONUS_MULTIPLIER.toString());
  });

  test('should allow host to select another player and transfer host role', async ({ setupPage, session }) => {
    const targetPlayer = session.players[2];

    await expect(setupPage.hostSettings).toBeVisible();
    await expect(setupPage.waitingMsg).toBeHidden();

    // Open the dropdown
    await setupPage.hostTransferDropdownBtn.click();
    await expect(setupPage.hostTransferList).toBeVisible();

    // Select the target player from the list
    await setupPage.getPlayerItem(targetPlayer.id).click();

    // Verify selection state
    await expect(setupPage.hostTransferList).toBeHidden();
    await expect(setupPage.hostTransferConfirmBtn).toBeEnabled();

    // Verify the header updated with the selected player's name
    await expect(setupPage.hostTransferDropdownBtn).toContainText(targetPlayer.username);

    // Execute the transfer
    await setupPage.hostTransferConfirmBtn.click();
    await expect(setupPage.hostTransferConfirmBtn).toHaveText(/transferring/i);

    // Verify UI transition to the player UI
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(setupPage.waitingMsg).toBeVisible();
  });

  test('should allow host to configure game and transfer host using only keyboard', async ({
    setupPage,
    page,
    session,
  }) => {
    await expect(setupPage.hostSettings).toBeVisible();

    // Configure rounds
    await setupPage.roundsInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('5');

    // Configure guess time
    await page.keyboard.press('Tab');
    await expect(setupPage.maxGuessTimeInput).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('30');

    // Move through joker buttons
    await page.keyboard.press('Tab');
    await expect(setupPage.firstJoker).toBeFocused();
    await expect(setupPage.firstJoker).toHaveClass(/\bactive\b/);
    await expect(setupPage.firstJoker).not.toHaveClass(/\binactive\b/);
    await page.keyboard.press('Space');
    await expect(setupPage.firstJoker).toHaveClass(/\binactive\b/);
    await expect(setupPage.firstJoker).not.toHaveClass(/\bactive\b/);

    // Continue tabbing until Advanced Settings button
    await setupPage.tabUntilFocused(setupPage.advancedSettingsToggle);

    // Open advanced settings
    await page.keyboard.press('Enter');

    // Time bonus select
    await page.keyboard.press('Tab');
    const previousValue = await setupPage.timeBonusSelect.inputValue();
    await page.keyboard.press('ArrowDown');
    const newValue = await setupPage.timeBonusSelect.inputValue();
    expect(newValue).not.toBe(previousValue);

    // First bonus radio buttons
    await page.keyboard.press('Tab');
    const checkedBefore = await setupPage.getActiveFirstBonus();
    await page.keyboard.press('ArrowRight');
    const checkedAfter = await setupPage.getActiveFirstBonus();
    expect(checkedAfter).not.toBe(checkedBefore);

    // Continue until Confirm button
    await setupPage.tabUntilFocused(setupPage.startBtn);
    await expect(setupPage.startBtn).toBeFocused();

    // Continue to host transfer dropdown
    await page.keyboard.press('Tab');
    await expect(setupPage.hostTransferDropdownBtn).toBeFocused();

    // Open dropdown
    await page.keyboard.press('Enter');
    await expect(setupPage.hostTransferList).toBeVisible();

    // Wait until first element is focused
    const firstItem = setupPage.getPlayerItem(session.players[1].id);
    await expect(firstItem).toBeFocused();

    // Navigate to third player
    await page.keyboard.press('ArrowDown');
    const targetItem = setupPage.getPlayerItem(session.players[2].id);
    await expect(targetItem).toBeFocused();

    // Select player
    await page.keyboard.press('Enter');
    await expect(setupPage.hostTransferList).toBeHidden();
    await expect(setupPage.hostTransferDropdownBtn).toContainText(session.players[2].username);

    // Transfer button
    await page.keyboard.press('Tab');
    await expect(setupPage.hostTransferConfirmBtn).toBeFocused();
    await expect(setupPage.hostTransferConfirmBtn).toBeEnabled();

    // Execute transfer
    await page.keyboard.press('Enter');
    await expect(setupPage.hostTransferConfirmBtn).toHaveText(/transferring/i);

    // Host becomes non-host
    await expect(setupPage.hostSettings).toBeHidden();
    await expect(setupPage.waitingMsg).toBeVisible();
  });

  test('should not have any automatically detectable accessibility issues', async ({ setupPage, page }, testInfo) => {
    await setupPage.waitForLoaded();

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
