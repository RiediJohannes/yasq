import AxeBuilder from '@axe-core/playwright';

import { formatViolations, highlightAccessibilityViolations } from '../utils/accessibility.js';
import { expect, test } from './test_setup.js';

test.describe('Playlist Creation', () => {
  test.use({ creatorDataFixture: 'single-track' });

  test('should create a playlist with one track', async ({ playlistPage }) => {
    await playlistPage.goto('/playlists');
    await playlistPage.addPlaylistButton.click();

    await expect(playlistPage.playlistForm.getByRole('heading', { name: 'Add New Playlist' })).toBeVisible();
    await playlistPage.playlistNameInput.fill('Playlist A');
    await expect(playlistPage.trackCheckboxes).toHaveCount(1);
    await playlistPage.trackCheckboxes.check();
    await playlistPage.savePlaylistButton.click();

    await expect(playlistPage.getPlaylistCard('Playlist A')).toContainText('1 tracks included');
  });
});

test.describe('Playlist Edit/Delete', () => {
  test.use({ creatorDataFixture: 'single-playlist' });

  test('should edit a playlist', async ({ playlistPage }) => {
    await playlistPage.goto('/playlists');
    const playlistCard = playlistPage.getPlaylistCard('Playlist A');

    await playlistCard.getByRole('button', { name: 'View Tracks' }).click();
    const includedTracks = playlistPage.getPlaylistTracks('Playlist A');
    await expect(includedTracks).toBeVisible();
    await expect(includedTracks).toContainText('Game A');
    await expect(includedTracks).toContainText('Game B');
    await expect(includedTracks).not.toContainText('Game C');

    await playlistCard.getByRole('button', { name: 'Edit' }).click();
    await expect(playlistPage.playlistForm.getByRole('heading', { name: 'Edit Playlist' })).toBeVisible();
    await expect(playlistPage.getTrackCheckbox('Game A')).toBeChecked();
    await expect(playlistPage.getTrackCheckbox('Game B')).toBeChecked();
    await expect(playlistPage.getTrackCheckbox('Game C')).not.toBeChecked();

    await playlistPage.playlistNameInput.fill('Playlist B');
    await playlistPage.getTrackCheckbox('Game B').uncheck();
    await playlistPage.getTrackCheckbox('Game C').check();
    await playlistPage.updatePlaylistButton.click();

    const updatedPlaylistCard = playlistPage.getPlaylistCard('Playlist B');
    await expect(updatedPlaylistCard).toContainText('2 tracks included');

    await updatedPlaylistCard.getByRole('button', { name: 'View Tracks' }).click();
    const includedUpdatedTracks = playlistPage.getPlaylistTracks('Playlist B');
    await expect(includedUpdatedTracks).toBeVisible();
    await expect(includedUpdatedTracks).toContainText('Game A');
    await expect(includedUpdatedTracks).toContainText('Game C');
    await expect(includedUpdatedTracks).not.toContainText('Game B');
  });

  test('should delete a playlist', async ({ page, playlistPage }) => {
    await playlistPage.goto('/playlists');
    const playlistCard = playlistPage.getPlaylistCard('Playlist A');

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await playlistCard.getByRole('button', { name: 'Delete' }).click();
    expect(await dialogMessage).toBe('Are you sure you want to delete this playlist?');

    await expect(playlistPage.getPlaylistCard('Playlist A')).toHaveCount(0);
  });
});

test.describe('Playlist Filtering', () => {
  test.use({ creatorDataFixture: 'multiple-playlists' });

  test('should filter playlists by name', async ({ playlistPage }) => {
    await playlistPage.goto('/playlists');
    await expect(playlistPage.playlistCards).toHaveCount(3);

    await playlistPage.searchInput.fill('Playlist B');
    await expect(playlistPage.playlistCards).toHaveCount(1);

    await playlistPage.clearSearchButton.click();
    await expect(playlistPage.searchInput).toHaveValue('');
    await expect(playlistPage.playlistCards).toHaveCount(3);
  });
});

test.describe('Playlist Sorting', () => {
  test.use({ creatorDataFixture: 'sorting' });

  test('should sort playlists by name', async ({ playlistPage }) => {
    await playlistPage.goto('/playlists');

    await expect(playlistPage.playlistNames).toHaveText(['Playlist B', 'Playlist C', 'Playlist A']);

    await playlistPage.sortSelect.selectOption('name-asc');
    await expect(playlistPage.playlistNames).toHaveText(['Playlist A', 'Playlist B', 'Playlist C']);

    await playlistPage.sortSelect.selectOption('name-desc');
    await expect(playlistPage.playlistNames).toHaveText(['Playlist C', 'Playlist B', 'Playlist A']);

    await playlistPage.sortSelect.selectOption('original-asc');
    await expect(playlistPage.playlistNames).toHaveText(['Playlist B', 'Playlist C', 'Playlist A']);

    await playlistPage.sortSelect.selectOption('original-desc');
    await expect(playlistPage.playlistNames).toHaveText(['Playlist A', 'Playlist C', 'Playlist B']);
  });
});

test.describe('Accessibility', () => {
  test.use({ creatorDataFixture: 'multiple-playlists' });

  test('should not have any automatically detectable accessibility issues in playlist list', async ({
    playlistPage,
    page,
  }, testInfo) => {
    await playlistPage.goto('/playlists');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'page-has-heading-one'])
      .analyze();

    highlightAccessibilityViolations(page, accessibilityScanResults.violations);

    await testInfo.attach('violations', {
      body: JSON.stringify(accessibilityScanResults.violations, null, 2),
      contentType: 'application/json',
    });

    expect(
      accessibilityScanResults.violations.length,
      `Accessibility violations found:${formatViolations(accessibilityScanResults.violations)}\n\nSee attached violations file for more details.`
    ).toEqual(0);
  });

  test('should not have any automatically detectable accessibility issues in playlist form', async ({
    playlistPage,
    page,
  }, testInfo) => {
    await playlistPage.goto('/playlists/new');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'page-has-heading-one'])
      .analyze();

    highlightAccessibilityViolations(page, accessibilityScanResults.violations);

    await testInfo.attach('violations', {
      body: JSON.stringify(accessibilityScanResults.violations, null, 2),
      contentType: 'application/json',
    });

    expect(
      accessibilityScanResults.violations.length,
      `Accessibility violations found:${formatViolations(accessibilityScanResults.violations)}\n\nSee attached violations file for more details.`
    ).toEqual(0);
  });
});
