import { Locator, Page } from '@playwright/test';
import { CreatorPage } from './CreatorPage';

export class PermissionsPage extends CreatorPage {
  readonly addPermissionButton: Locator;
  readonly permissionRules: Locator;
  readonly permissionForm: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly discordServerSelect: Locator;
  readonly ruleTypeSelect: Locator;
  readonly manualUserIdInput: Locator;
  readonly addManualUserIdButton: Locator;
  readonly manualUserIds: Locator;
  readonly userSearchInput: Locator;
  readonly clearUserSearchButton: Locator;
  readonly clearUserSelectionsButton: Locator;
  readonly trackSearchInput: Locator;
  readonly clearTrackSearchButton: Locator;
  readonly clearTrackSelectionsButton: Locator;
  readonly clearPermissionFiltersButton: Locator;
  readonly addRuleButton: Locator;
  readonly updateRuleButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addPermissionButton = page.getByRole('button', { name: '+ Add Permission' });
    this.permissionRules = page.locator('.permission-rule-card');
    this.permissionForm = page.locator('form.creator-form');
    this.searchInput = page.getByRole('textbox', { name: 'Search' });
    this.clearSearchButton = page.locator('.clear-search-btn');
    this.discordServerSelect = page.getByLabel('Discord Server');
    this.ruleTypeSelect = page.getByLabel('Rule Type');
    this.manualUserIdInput = page.getByLabel('Add Discord User ID');
    this.addManualUserIdButton = page.getByRole('button', { name: 'Add ID', exact: true });
    this.manualUserIds = page.locator('.permission-manual-user-list li');
    this.userSearchInput = page.locator('#permission-user-search');
    this.clearUserSearchButton = this.permissionForm.getByRole('button', { name: 'Clear user search' });
    this.clearUserSelectionsButton = this.permissionForm.getByRole('button', { name: 'Clear selected users' });
    this.trackSearchInput = page.locator('#permission-track-search');
    this.clearTrackSearchButton = this.permissionForm.getByRole('button', { name: 'Clear track search' });
    this.clearTrackSelectionsButton = this.permissionForm.getByRole('button', { name: 'Clear selected tracks' });
    this.clearPermissionFiltersButton = page.locator('.tag-filter-section').getByRole('button', { name: 'Clear' });
    this.addRuleButton = page.getByRole('button', { name: 'Add Rule', exact: true });
    this.updateRuleButton = page.getByRole('button', { name: 'Update Rule' });
  }

  getPermissionRule(text: string): Locator {
    return this.permissionRules.filter({ hasText: text });
  }

  getPermissionRuleTrackItem(ruleText: string): Locator {
    return this.getPermissionRule(ruleText).locator('.permission-rule-file');
  }

  getPermissionRuleType(type: 'whitelist' | 'blacklist'): Locator {
    return this.permissionRules.locator(`.permission-rule-type.${type}`);
  }

  getUserAvatar(displayName: string): Locator {
    return this.page.locator('.permission-rule-user').filter({ hasText: displayName }).locator('img');
  }

  getUserCheckbox(displayName: string): Locator {
    return this.permissionForm
      .locator('.playlist-track-item')
      .filter({ hasText: displayName })
      .locator('input[type="checkbox"]')
      .first();
  }

  getTrackCheckbox(gameName: string): Locator {
    return this.permissionForm
      .locator('.playlist-track-item')
      .filter({ hasText: gameName })
      .locator('input[type="checkbox"]')
      .last();
  }

  getPermissionTypeFilter(type: 'Whitelist' | 'Blacklist'): Locator {
    return this.page.getByLabel(type);
  }
}
