import { Page, Locator } from '@playwright/test';

export class ResultsPage {
  readonly page: Page;
  readonly playerResults: Locator;
  readonly resultsContainer: Locator;
  readonly correctPlayersContainer: Locator;
  readonly ownResults: Locator;
  readonly ownGuess: Locator;
  readonly ownScoreBubble: Locator;
  readonly readyBtn: Locator;
  readonly tagsContainer: Locator;
  readonly tagBadges: Locator;

  constructor(page: Page) {
    this.page = page;
    this.playerResults = page.locator('.player-result');
    this.resultsContainer = page.locator('#results');
    this.readyBtn = page.locator('#btn-ready');
    this.correctPlayersContainer = page.locator('#correct-players');
    this.ownResults = page.locator('#own-results');
    this.ownGuess = this.ownResults.locator('#guess');
    this.ownScoreBubble = this.ownResults.locator('#score');
    this.tagsContainer = this.resultsContainer.locator('#tags');
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
    return this.ownResults.locator(`.user-guess-result.${status}`);
  }

  async clickReady() {
    await this.readyBtn.click();
  }
}