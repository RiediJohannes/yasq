import { Page } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForLoaded(selector = '.game-area') {
    await this.page.locator(selector).waitFor({ state: 'visible' });
  }
}
