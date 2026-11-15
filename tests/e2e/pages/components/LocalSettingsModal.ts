import { Locator, Page } from '@playwright/test';
import { BaseModal } from './BaseModal';

export class LocalSettingsModal extends BaseModal {
  readonly themeGroup: Locator;
  readonly keyboardShortcutsGroup: Locator;

  constructor(page: Page) {
    super(page, '#local-settings-modal');

    this.themeGroup = this.component.locator('#theme-group');
    this.keyboardShortcutsGroup = this.component.locator('#keyboard-hints-group');
  }

  async setTheme(theme: 'auto' | 'dark' | 'light') {
    await this.themeGroup.locator(`label[for="theme-${theme}"]`).click();
  }

  async setKeyboardHints(option: boolean) {
    await this.keyboardShortcutsGroup.locator(`label[for="keyboard-hints-${option}"]`).click();
  }
}
