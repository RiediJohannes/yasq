import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Joker } from '@yasq/shared';
import { Player } from '../../utils/helper';

type ResultType = 'correct' | 'partial' | 'wrong';

export class HostReviewPage extends BasePage {
  readonly resultsContainer: Locator;
  readonly guessList: Locator;
  readonly resultsTitle: Locator;
  readonly resultsTrackName: Locator;
  readonly timedOutSection: Locator;
  readonly submitReviewedBtn: Locator;

  constructor(page: Page) {
    super(page);

    this.resultsContainer = this.content.locator('#results');
    this.guessList = this.content.locator('#guess-list');
    this.resultsTitle = this.content.locator('h2');
    this.resultsTrackName = this.content.locator('#results p >> strong');
    this.timedOutSection = this.content.locator('.timed-out-section');
    this.submitReviewedBtn = this.content.locator('#btn-submit-reviewed-results');
  }

  getGuessItem(username: string): Locator {
    return this.content.locator(`.guess-item:has-text("${username}")`);
  }

  getCorrectionRadio(playerId: string, status: 'wrong' | 'correct'): Locator {
    return this.content.locator(`#${status}-${playerId}`);
  }

  async setGuessResult(playerId: string, result: ResultType) {
    // Dynamically targeting the label based on the result type and playerId
    await this.content.locator(`label[for="${result}-${playerId}"]`).click();
  }

  getJokerIndicator(player: Player, jokerType?: Joker): Locator {
    if (jokerType) {
      return this.getGuessItem(player.username).locator(`.joker-indicator#${jokerType.toLowerCase()}-${player.id}`);
    }
    return this.getGuessItem(player.username).locator('.joker-indicator');
  }
}
