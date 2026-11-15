import AxeBuilder from '@axe-core/playwright';

import { formatViolations, highlightAccessibilityViolations } from '../utils/accessibility.js';
import { expect, test } from './test_setup.js';

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
