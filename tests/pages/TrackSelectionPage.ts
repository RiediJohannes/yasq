import { Page, Locator } from '@playwright/test';

export class TrackSelectionPage {
  readonly page: Page;
  readonly selectionTitle: Locator;
  readonly waitingTitle: Locator;
  readonly trackList: Locator;
  readonly trackItems: Locator;
  readonly searchInput: Locator;
  readonly tagFilterDropdown: Locator;
  readonly hidePlayedCheckbox: Locator;
  readonly progressBar: Locator;
  readonly clearFiltersButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.selectionTitle = page.locator('h2:has-text("Select the next track to challenge players:")');
    this.waitingTitle = page.locator('h2:has-text("Waiting for players to submit their guesses...")');
    this.trackList = page.locator('#track-selection-grid');
    this.trackItems = this.trackList.locator('button');
    this.searchInput = page.locator('#track-search');
    this.tagFilterDropdown = page.locator('.filter-dropdown');
    this.hidePlayedCheckbox = page.locator('#hide-played');
    this.progressBar = page.locator('#progress-bar');
    this.clearFiltersButton = page.locator('button[title="Clear all filters"]');
  }

  async selectTrack(index: number) {
    await this.trackItems.nth(index).click();
  }

  async selectTag(tagName: string) {
    await this.getTagItem(tagName).click();
  }

  getTagItem(tagName: string): Locator {
    return this.page.locator(`.dropdown-item:has-text("${tagName}")`);
  }
}