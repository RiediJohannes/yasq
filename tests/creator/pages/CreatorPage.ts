import { expect, Locator, Page } from '@playwright/test';

export class CreatorPage {
  readonly page: Page;
  readonly dashboardHeading: Locator;
  readonly tracksTab: Locator;
  readonly playlistsTab: Locator;
  readonly settingsTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardHeading = page.getByRole('heading', { name: 'YASQ Creator Dashboard' });
    this.tracksTab = page.getByRole('button', { name: 'Tracks', exact: true });
    this.playlistsTab = page.getByRole('button', { name: 'Playlists', exact: true });
    this.settingsTab = page.getByRole('button', { name: 'Settings', exact: true });
  }

  async goto(path: string) {
    await this.page.goto(path);
    await expect(this.dashboardHeading).toBeVisible();
  }
}
