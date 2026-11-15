import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class TrackSelectionPage extends BasePage {
  readonly selectionTitle: Locator;
  readonly waitingTitle: Locator;
  readonly trackList: Locator;
  readonly trackItems: Locator;
  readonly searchInput: Locator;
  readonly tagFilterDropdown: Locator;
  readonly hidePlayedCheckbox: Locator;
  readonly clearFiltersButton: Locator;

  constructor(page: Page) {
    super(page);

    this.selectionTitle = this.content.locator('h2:has-text("Select the next track to challenge players:")');
    this.waitingTitle = this.content.locator('h2:has-text("Waiting for players to submit their guesses...")');
    this.trackList = this.content.locator('#track-selection-grid');
    this.trackItems = this.trackList.locator('button');
    this.searchInput = this.content.locator('#track-search');
    this.tagFilterDropdown = this.content.locator('.filter-dropdown');
    this.hidePlayedCheckbox = this.content.locator('#hide-played');
    this.clearFiltersButton = this.content.locator('button[title="Clear all filters"]');
  }

  async selectTrack(index: number) {
    await this.trackItems.nth(index).click();
  }

  async selectTag(tagName: string) {
    await this.getTagItem(tagName).click();
  }

  getTagItem(tagName: string): Locator {
    return this.content.locator(`.dropdown-item:has-text("${tagName}")`);
  }
}
