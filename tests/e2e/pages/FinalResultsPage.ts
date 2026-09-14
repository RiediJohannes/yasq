import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class FinalResultsPage extends BasePage {
  readonly playerCards: Locator;
  readonly readyBtn: Locator;
  readonly restartBtn: Locator;
  readonly gameStats: Locator;
  readonly statItems: Locator;

  constructor(page: Page) {
    super(page);

    this.playerCards = page.locator('.player-card');
    this.readyBtn = page.locator('#btn-ready');
    this.restartBtn = page.locator('#btn-restart');
    this.gameStats = page.locator('.game-stats');
    this.statItems = this.gameStats.locator('.game-stat-item');
  }

  getPlayerCard(index: number) {
    const card = this.playerCards.nth(index);
    return {
      card,
      rank: card.locator('.rank'),
      name: card.locator('.name'),
      score: card.locator('.total-score'),
      bubbles: card.locator('.round-bubble'),
      // Helper to filter bubbles by status class
      getBubbles: (status: 'correct' | 'incorrect') => card.locator(`.round-bubble.${status}`),
    };
  }

  getStatItem(index: number) {
    const item = this.statItems.nth(index);
    return {
      item,
      label: item.locator('.game-stat-label'),
      value: item.locator('.game-stat-value'),
      subValue: item.locator('.game-stat-subvalue'),
      avatar: item.locator('img'),
    };
  }
}
