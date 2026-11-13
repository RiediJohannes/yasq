import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

type BadgeType = 'host' | 'ready' | 'guessed' | 'winner' | 'streak';

export class Sidebar extends BaseComponent {
  constructor(page: Page) {
    super(page, '#sidebar');
  }

  private getPlayerRow(username: string): Locator {
    return this.component.locator(`.player-entry:has-text("${username}")`);
  }

  getBadge(username: string, type: BadgeType): Locator {
    return this.getPlayerRow(username).locator(`.badge.${type}`);
  }
}
