import { Locator, Page } from '@playwright/test';
import { CreatorPage } from './CreatorPage';

export class PlaylistPage extends CreatorPage {
  readonly addPlaylistButton: Locator;
  readonly playlistCards: Locator;
  readonly playlistNames: Locator;
  readonly playlistForm: Locator;
  readonly playlistNameInput: Locator;
  readonly trackCheckboxes: Locator;
  readonly savePlaylistButton: Locator;
  readonly updatePlaylistButton: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly sortSelect: Locator;

  constructor(page: Page) {
    super(page);
    this.addPlaylistButton = page.getByRole('button', { name: '+ Add Playlist' });
    this.playlistCards = page.locator('.playlists-container .playlist-card');
    this.playlistNames = this.playlistCards.locator('.playlist-card-header .track-info strong');
    this.playlistForm = page.locator('form.creator-form');
    this.playlistNameInput = page.getByLabel('Playlist Name');
    this.trackCheckboxes = page.locator('.playlist-track-selector input[type="checkbox"]');
    this.savePlaylistButton = page.getByRole('button', { name: 'Save Playlist' });
    this.updatePlaylistButton = page.getByRole('button', { name: 'Update Playlist' });
    this.searchInput = page.getByRole('textbox', { name: 'Search' });
    this.clearSearchButton = page.locator('.clear-search-btn');
    this.sortSelect = page.getByLabel('Sort by:');
  }

  getPlaylistCard(name: string): Locator {
    return this.playlistCards.filter({ hasText: name });
  }

  getPlaylistTracks(name: string): Locator {
    return this.getPlaylistCard(name).locator('.playlist-tracks-dropdown');
  }

  getTrackCheckbox(gameName: string): Locator {
    return this.page.locator('.playlist-track-item').filter({ hasText: gameName }).locator('input[type="checkbox"]');
  }
}
