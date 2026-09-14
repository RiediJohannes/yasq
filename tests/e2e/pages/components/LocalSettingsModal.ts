import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';

export class LocalSettingsModal extends BasePage {
  readonly modal: Locator;
  readonly closeBtn: Locator;

  readonly themeGroup: Locator;
  readonly keyboardShortcutsGroup: Locator;

  constructor(page: Page) {
    super(page);

    this.modal = page.locator('#local-settings-modal');
    this.closeBtn = this.modal.locator('.modal-close-cross');

    this.themeGroup = page.locator('#theme-group');
    this.keyboardShortcutsGroup = page.locator('#keyboard-hints-group');
  }

  async setTheme(theme: 'auto' | 'dark' | 'light') {
    await this.themeGroup.locator(`label[for="theme-${theme}"]`).click();
  }

  async setKeyboardHints(option: boolean) {
    await this.keyboardShortcutsGroup.locator(`label[for="keyboard-hints-${option}"]`).click();
  }
}
