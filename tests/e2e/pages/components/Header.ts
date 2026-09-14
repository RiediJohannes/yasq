import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';

export class Header extends BasePage {
  readonly settingsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.settingsButton = page.locator('#local-settings-btn');
  }
}
