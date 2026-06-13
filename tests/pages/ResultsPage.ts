import { Page, Locator } from '@playwright/test';

export class ResultsPage {
  readonly page: Page;
  readonly playerResults: Locator;
  readonly resultsContainer: Locator;
  readonly ownResults: Locator;
  readonly readyBtn: Locator;
  readonly tagsContainer: Locator;
  readonly tagBadges: Locator;

  constructor(page: Page) {
    this.page = page;
    this.playerResults = page.locator('.player-result');
    this.resultsContainer = page.locator('#results');
    this.ownResults = page.locator('.own-results');
    this.readyBtn = page.locator('#btn-ready');
    this.tagsContainer = this.resultsContainer.locator('.tags-container');
    this.tagBadges = this.tagsContainer.locator('.tag-badge');
  }

  getPlayerResult(index: number) {
    const root = this.playerResults.nth(index);
    return {
      name: root.locator('.name'),
      bubble: root.locator('.round-bubble'),
      time: root.locator('.time-display')
    };
  }

  getPersonalResultStatus(status: 'correct' | 'partial' | 'incorrect'): Locator {
    return this.ownResults.locator(`.result.${status}`);
  }

  async clickReady() {
    await this.readyBtn.click();
  }
}