import { Locator, Page } from '@playwright/test';

export abstract class BaseComponent {
  readonly page: Page;
  protected readonly component: Locator;

  protected constructor(page: Page, componentSelector: string) {
    this.page = page;
    this.component = page.locator(componentSelector);
  }
}
