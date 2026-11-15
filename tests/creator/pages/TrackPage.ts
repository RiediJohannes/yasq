import { Locator, Page } from '@playwright/test';
import { CreatorPage } from './CreatorPage';

export class TrackPage extends CreatorPage {
  readonly addTrackButton: Locator;
  readonly trackCards: Locator;
  readonly trackNames: Locator;
  readonly trackForm: Locator;
  readonly gameNameInput: Locator;
  readonly trackTitleInput: Locator;
  readonly audioFileInput: Locator;
  readonly addTagButton: Locator;
  readonly saveTrackButton: Locator;
  readonly updateTrackButton: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly sortSelect: Locator;
  readonly tagFilterSection: Locator;
  readonly clearTagFiltersButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addTrackButton = page.getByRole('button', { name: '+ Add Track' });
    this.trackCards = page.locator('.tracks-container .tracks-list .card');
    this.trackNames = this.trackCards.locator('.track-info strong');
    this.trackForm = page.locator('form.creator-form');
    this.gameNameInput = page.getByLabel('Game Name');
    this.trackTitleInput = page.getByLabel('Track Title');
    this.audioFileInput = page.getByLabel('Audio File');
    this.addTagButton = page.getByRole('button', { name: '+ Add Tag' });
    this.saveTrackButton = page.getByRole('button', { name: 'Save Track' });
    this.updateTrackButton = page.getByRole('button', { name: 'Update Track' });
    this.searchInput = page.getByRole('textbox', { name: 'Search' });
    this.clearSearchButton = page.locator('.clear-search-btn');
    this.sortSelect = page.getByLabel('Sort by:');
    this.tagFilterSection = page.locator('.tag-filter-section');
    this.clearTagFiltersButton = this.tagFilterSection.getByRole('button', { name: 'Clear All' });
  }

  getTagTypeInput(index = 0): Locator {
    return this.page.getByPlaceholder('Type').nth(index);
  }

  getTagValueInput(index = 0): Locator {
    return this.page.getByPlaceholder('Value').nth(index);
  }

  getTrackCard(title: string): Locator {
    return this.trackCards.filter({ hasText: title });
  }

  getTagCategory(category: string): Locator {
    return this.tagFilterSection
      .locator('.tag-category-group')
      .filter({ has: this.page.locator('.tag-category-title', { hasText: category }) });
  }

  getTagCheckbox(value: string): Locator {
    return this.tagFilterSection.getByRole('checkbox', { name: value });
  }
}
