import { Page, Locator } from '@playwright/test';

export class LobbyPage {
  readonly page: Page;
  readonly startBtn: Locator;
  readonly readyBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startBtn = page.locator('#btn-start');
    this.readyBtn = page.locator('#btn-ready');
  }

  async clickReady(): Promise<void> {
    await this.readyBtn.click();
  }
}