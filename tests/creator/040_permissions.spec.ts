import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { formatViolations, highlightAccessibilityViolations } from '../utils/accessibility.js';
import { expect, test } from './test_setup.js';

const GUILD_ID = '123456789012345678';
const ALICE_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';
const BOB_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/1.png';

const discordUsers = [
  {
    id: '1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: ALICE_AVATAR_URL,
  },
  {
    id: '2',
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: BOB_AVATAR_URL,
  },
];

async function mockDiscordRequests(page: Page, guilds = [{ id: GUILD_ID, name: 'Test Server' }]) {
  await page.route('**/api/discord-guilds', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(guilds),
    })
  );

  await page.route(/\/api\/discord-users(?:\?.*)?$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(discordUsers),
    })
  );

  await page.route(/\/api\/discord-user-profiles(?:\?.*)?$/, async route => {
    const userIds = new URL(route.request().url()).searchParams.getAll('id');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(discordUsers.filter(user => userIds.includes(user.id))),
    });
  });
}

test.describe('Permission Rule Creation', () => {
  test.use({ creatorDataFixture: 'multiple-tracks' });

  test('should create a permission rule', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');
    await permissionsPage.addPermissionButton.click();

    await expect(permissionsPage.permissionForm.getByRole('heading', { name: 'Add Permission Rule' })).toBeVisible();
    await permissionsPage.discordServerSelect.selectOption(GUILD_ID);

    const aliceCheckbox = permissionsPage.getUserCheckbox('Alice');
    const bobCheckbox = permissionsPage.getUserCheckbox('Bob');
    await expect(aliceCheckbox).toBeVisible();
    await expect(bobCheckbox).toBeVisible();
    await aliceCheckbox.check();
    await bobCheckbox.check();
    await permissionsPage.ruleTypeSelect.selectOption('whitelist');
    await permissionsPage.getTrackCheckbox('Game A').check();
    await permissionsPage.addRuleButton.click();

    const permissionRule = permissionsPage.getPermissionRule('Alice');
    await expect(permissionRule).toContainText('whitelist');
    await expect(permissionRule).toContainText('Bob');
    await expect(permissionRule.locator(`img[src="${ALICE_AVATAR_URL}"]`)).toHaveCount(1);
    await expect(permissionRule.locator(`img[src="${BOB_AVATAR_URL}"]`)).toHaveCount(1);

    await permissionRule.getByRole('button', { name: 'View Tracks' }).click();
    const trackItem = permissionsPage.getPermissionRuleTrackItem('Bob').filter({ hasText: 'Game A' });
    await expect(trackItem).toContainText('Game A');
    await expect(trackItem).toContainText('Track A');
    await expect(trackItem).toContainText('fixture-track-1.mp3');
    await expect(trackItem.locator('img')).toHaveAttribute('src', '/default.svg');
  });

  test('should create a permission rule with a manually entered user ID when no server is selected', async ({
    page,
    permissionsPage,
  }) => {
    const userId = '987654321012345678';
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions/new');

    await expect(permissionsPage.discordServerSelect).toHaveValue('');
    await expect(permissionsPage.manualUserIdInput).toBeVisible();
    await permissionsPage.manualUserIdInput.fill(userId);
    await permissionsPage.addManualUserIdButton.click();
    await expect(permissionsPage.manualUserIds).toContainText(userId);

    await permissionsPage.getTrackCheckbox('Game A').check();
    await permissionsPage.addRuleButton.click();

    const permissionRule = permissionsPage.getPermissionRule(userId);
    await expect(permissionRule).toContainText('whitelist');
    await expect(permissionRule).toContainText(userId);
  });

  test('should allow adding user IDs when no servers are available', async ({ page, permissionsPage }) => {
    const userId = '987654321012345678';
    await mockDiscordRequests(page, []);
    await permissionsPage.goto('/permissions/new');

    await expect(permissionsPage.discordServerSelect).toBeDisabled();
    await expect(permissionsPage.manualUserIdInput).toBeVisible();
    await permissionsPage.manualUserIdInput.fill(userId);
    await permissionsPage.addManualUserIdButton.click();

    await expect(permissionsPage.manualUserIds).toContainText(userId);
  });

  test('should clear user and track searches', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions/new');
    await permissionsPage.discordServerSelect.selectOption(GUILD_ID);

    await permissionsPage.userSearchInput.fill('alice');
    await expect(permissionsPage.getUserCheckbox('Bob')).toBeHidden();
    await permissionsPage.clearUserSearchButton.click();
    await expect(permissionsPage.userSearchInput).toHaveValue('');
    await expect(permissionsPage.getUserCheckbox('Bob')).toBeVisible();

    await permissionsPage.trackSearchInput.fill('Game A');
    await expect(permissionsPage.getTrackCheckbox('Game B')).toBeHidden();
    await permissionsPage.clearTrackSearchButton.click();
    await expect(permissionsPage.trackSearchInput).toHaveValue('');
    await expect(permissionsPage.getTrackCheckbox('Game B')).toBeVisible();
  });

  test('should clear user and track selections independently', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions/new');
    await permissionsPage.discordServerSelect.selectOption(GUILD_ID);

    const aliceCheckbox = permissionsPage.getUserCheckbox('Alice');
    const gameACheckbox = permissionsPage.getTrackCheckbox('Game A');
    const gameBCheckbox = permissionsPage.getTrackCheckbox('Game B');
    await aliceCheckbox.check();
    await gameACheckbox.check();
    await gameBCheckbox.check();

    await permissionsPage.clearUserSelectionsButton.click();
    await expect(aliceCheckbox).not.toBeChecked();
    await expect(gameACheckbox).toBeChecked();
    await expect(gameBCheckbox).toBeChecked();

    await permissionsPage.clearTrackSelectionsButton.click();
    await expect(gameACheckbox).not.toBeChecked();
    await expect(gameBCheckbox).not.toBeChecked();
    await expect(aliceCheckbox).not.toBeChecked();
  });
});

test.describe('Permission Rule Edit/Delete', () => {
  test.use({ creatorDataFixture: 'single-permissions' });

  test('should edit a permission rule', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');
    const permissionRule = permissionsPage.getPermissionRule('Alice');
    await expect(permissionRule).toContainText('1 tracks included');

    await permissionRule.getByRole('button', { name: 'Edit' }).click();
    await expect(permissionsPage.permissionForm.getByRole('heading', { name: 'Edit Permission Rule' })).toBeVisible();
    await permissionsPage.discordServerSelect.selectOption(GUILD_ID);
    const aliceCheckbox = permissionsPage.getUserCheckbox('Alice');
    const bobCheckbox = permissionsPage.getUserCheckbox('Bob');
    await expect(aliceCheckbox).toBeChecked();
    await expect(bobCheckbox).not.toBeChecked();
    await expect(permissionsPage.getTrackCheckbox('Game A')).toBeChecked();
    await expect(permissionsPage.getTrackCheckbox('Game B')).not.toBeChecked();
    await expect(permissionsPage.getTrackCheckbox('Game C')).not.toBeChecked();

    await aliceCheckbox.uncheck();
    await bobCheckbox.check();
    await permissionsPage.ruleTypeSelect.selectOption('blacklist');
    await permissionsPage.getTrackCheckbox('Game B').check();
    await permissionsPage.updateRuleButton.click();

    const updatedPermissionRule = permissionsPage.getPermissionRule('Bob');
    await expect(updatedPermissionRule).toContainText('blacklist');
    await expect(updatedPermissionRule).not.toContainText('Alice');
    await expect(updatedPermissionRule).toContainText('2 tracks included');

    await updatedPermissionRule.getByRole('button', { name: 'View Tracks' }).click();
    const trackItem = permissionsPage.getPermissionRuleTrackItem('Bob').filter({ hasText: 'Game A' });
    await expect(trackItem).toHaveCount(1);
    await expect(trackItem).toContainText('Game A');
    await expect(trackItem).toContainText('Track A');
    await expect(trackItem).toContainText('fixture-track.mp3');
    await expect(trackItem.locator('img')).toHaveAttribute('src', '/default.svg');
  });

  test('should delete a permission rule', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');
    const permissionRule = permissionsPage.getPermissionRule('Alice');

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await permissionRule.getByRole('button', { name: 'Delete' }).click();
    expect(await dialogMessage).toBe('Are you sure you want to delete this permission rule?');

    await expect(permissionRule).toHaveCount(0);
  });
});

test.describe('Permission Rule Filtering', () => {
  test.use({ creatorDataFixture: 'multiple-permissions' });

  test('should filter rules by username', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');

    await permissionsPage.searchInput.fill('alice');
    await expect(page.getByText('2 rules found')).toBeVisible();
    await expect(permissionsPage.permissionRules).toHaveCount(2);
    await expect(page.getByText('Alice', { exact: true })).toHaveCount(2);
  });

  test('should filter rules by game name', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');

    await permissionsPage.searchInput.fill('Game B');
    await expect(page.getByText('1 rules found')).toBeVisible();
    await expect(permissionsPage.permissionRules).toHaveCount(1);
    await expect(permissionsPage.permissionRules.first()).toContainText('Bob');
  });

  test('should filter rules by whitelist and blacklist', async ({ page, permissionsPage }) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');

    await permissionsPage.getPermissionTypeFilter('Whitelist').check();
    await expect(page.getByText('2 rules found')).toBeVisible();
    await expect(permissionsPage.permissionRules).toHaveCount(2);
    await expect(permissionsPage.getPermissionRuleType('blacklist')).toHaveCount(0);

    await permissionsPage.getPermissionTypeFilter('Blacklist').check();
    await expect(page.getByText('3 rules found')).toBeVisible();
    await expect(permissionsPage.permissionRules).toHaveCount(3);
    await expect(page.getByText('Alice', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Bob', { exact: true })).toHaveCount(2);
    await expect(permissionsPage.getUserAvatar('Alice')).toHaveCount(2);
    await expect(permissionsPage.getUserAvatar('Bob')).toHaveCount(2);

    await permissionsPage.clearPermissionFiltersButton.click();
    await expect(page.getByText('3 rules found')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.use({ creatorDataFixture: 'multiple-permissions' });

  test('should not have any automatically detectable accessibility issues in permission rule list', async ({
    permissionsPage,
    page,
  }, testInfo) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions');

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

  test('should not have any automatically detectable accessibility issues in permission rule form', async ({
    permissionsPage,
    page,
  }, testInfo) => {
    await mockDiscordRequests(page);
    await permissionsPage.goto('/permissions/new');

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
