import { Page, Locator } from '@playwright/test';

export class GameFinishedPage {
  readonly page: Page;
  readonly playerCards: Locator;
  readonly readyBtn: Locator;
  readonly restartBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.playerCards = page.locator('.player-card');
    this.readyBtn = page.locator('#btn-ready');
    this.restartBtn = page.locator('#btn-restart');
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
}