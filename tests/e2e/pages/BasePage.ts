import { Locator, Page } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  /** The actual content unique to the current page */
  protected readonly content: Locator;

  protected constructor(page: Page) {
    this.page = page;
    this.content = page.locator('main');
  }

  async waitForLoaded(selector?: string) {
    return selector
      ? await this.page.locator(selector).waitFor({ state: 'visible' })
      : await this.content.waitFor({ state: 'visible' });
  }
}
