import AxeBuilder from '@axe-core/playwright';

import { formatViolations, highlightAccessibilityViolations } from '../utils/accessibility.js';
import { expect, test } from './test_setup.js';

test.describe('Settings Edit', () => {
  test('should save game settings', async ({ page, settingsPage }) => {
    await settingsPage.goto('/settings');
    await expect(settingsPage.roundsInput).toBeVisible();
    await settingsPage.roundsInput.fill('17');

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await settingsPage.saveSettingsButton.click();
    expect(await dialogMessage).toBe('Settings saved successfully!');

    await expect(settingsPage.roundsInput).toHaveValue('17');
    await page.reload();
    await expect(settingsPage.roundsInput).toHaveValue('17');
  });

  test('should create and persist a custom achievement bonus', async ({ page, settingsPage }) => {
    await settingsPage.goto('/settings');
    await expect(settingsPage.achievementRuleNameInput).not.toBeVisible();
    await settingsPage.addCustomAchievementToggle.click();
    await expect(settingsPage.achievementRuleNameInput).toBeVisible();
    await settingsPage.achievementRuleNameInput.fill('Most Time Bonus');
    await settingsPage.achievementRuleMetricSelect.selectOption('timeBonus');
    await settingsPage.achievementRuleFilterSelect.selectOption('any');
    await settingsPage.achievementRuleAggregateSelect.selectOption('sum');
    await settingsPage.achievementRuleGoalSelect.selectOption('highest');
    await settingsPage.achievementRuleRewardInput.fill('250');
    await settingsPage.addAchievementBonusButton.click();

    await expect(settingsPage.achievementBonuses).toContainText('Most Time Bonus');
    await expect(settingsPage.achievementBonuses).toContainText('Highest Streak');
    await expect(settingsPage.restoreDefaultBonusesButton).not.toBeVisible();

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await settingsPage.saveSettingsButton.click();
    expect(await dialogMessage).toBe('Settings saved successfully!');

    await page.reload();
    await expect(settingsPage.achievementBonuses).toContainText('Most Time Bonus');
    await expect(settingsPage.achievementBonuses).toContainText('Highest Streak');
    await expect(settingsPage.achievementBonusCheckbox('Most Time Bonus')).toBeChecked();

    await settingsPage.removeAchievementBonusButton('Highest Streak').click();
    const removeDialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await settingsPage.saveSettingsButton.click();
    expect(await removeDialogMessage).toBe('Settings saved successfully!');

    await page.reload();
    await expect(settingsPage.achievementBonuses).not.toContainText('Highest Streak');
    await expect(settingsPage.achievementBonuses).toContainText('Fastest Correct Guess');
    await expect(settingsPage.achievementBonuses).toContainText('Most Time Bonus');

    await expect(settingsPage.restoreDefaultBonusesButton).toBeEnabled();
    await settingsPage.restoreDefaultBonusesButton.click();
    await expect(settingsPage.achievementBonuses).toContainText('Highest Streak');
    await expect(settingsPage.restoreDefaultBonusesButton).not.toBeVisible();

    const restoreDialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await settingsPage.saveSettingsButton.click();
    expect(await restoreDialogMessage).toBe('Settings saved successfully!');
    await page.reload();
    await expect(settingsPage.achievementBonuses).toContainText('Highest Streak');
    await expect(settingsPage.restoreDefaultBonusesButton).not.toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should not have any automatically detectable accessibility issues in settings form', async ({
    settingsPage,
    page,
  }, testInfo) => {
    await settingsPage.goto('/settings');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'page-has-heading-one'])
      .analyze();

    highlightAccessibilityViolations(page, accessibilityScanResults.violations);

    await testInfo.attach('violations', {
      body: JSON.stringify(accessibilityScanResults.violations, null, 2),
      contentType: 'application/json',
    });

    expect(
      accessibilityScanResults.violations.length,
      `Accessibility violations found:${formatViolations(accessibilityScanResults.violations)}\n\nSee attached violations file for more details.`
    ).toEqual(0);
  });
});
