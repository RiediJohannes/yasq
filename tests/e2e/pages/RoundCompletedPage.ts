import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

type ResultType = 'correct' | 'partial' | 'wrong';

export class RoundCompletedPage extends BasePage {
  readonly guessList: Locator;
  readonly resultsTitle: Locator;
  readonly resultsTrackName: Locator;
  readonly timedOutSection: Locator;
  readonly submitReviewedBtn: Locator;

  constructor(page: Page) {
    super(page);

    this.guessList = page.locator('#guess-list');
    this.resultsTitle = page.locator('main >> h2');
    this.resultsTrackName = page.locator('#results p >> strong');
    this.timedOutSection = page.locator('.timed-out-section');
    this.submitReviewedBtn = page.locator('#btn-submit-reviewed-results');
  }

  getGuessItem(username: string): Locator {
    return this.page.locator(`.guess-item:has-text("${username}")`);
  }

  getCorrectionRadio(playerId: string, status: 'wrong' | 'correct'): Locator {
    return this.page.locator(`#${status}-${playerId}`);
  }

  async setGuessResult(playerId: string, result: ResultType) {
    // Dynamically targeting the label based on the result type and playerId
    await this.page.locator(`label[for="${result}-${playerId}"]`).click();
  }

  getJokerIndicator(username: string, tooltip?: string): Locator {
    if (tooltip) {
      return this.getGuessItem(username).locator(`.joker-indicator[data-tooltip="${tooltip}"]`);
    }
    return this.getGuessItem(username).locator('.joker-indicator');
  }
}
