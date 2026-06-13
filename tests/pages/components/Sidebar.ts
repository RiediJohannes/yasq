import { Page, Locator } from '@playwright/test';

type BadgeType = "host" | "ready" | "guessed" | "winner" | "streak";

export class Sidebar {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private getPlayerRow(username: string): Locator {
    return this.page.locator(`.player-entry:has-text("${username}")`);
  }

  getBadge(username: string, type: BadgeType): Locator {
    return this.getPlayerRow(username).locator(`.badge.${type}`);
  }
}