import AxeBuilder from '@axe-core/playwright';

import { formatViolations, highlightAccessibilityViolations } from '../utils/accessibility.js';
import { expect, test } from './test_setup.js';

test.describe('Track Creation', () => {
  test('should create a track with a tag', async ({ trackPage }) => {
    await trackPage.goto('/tracks');
    await trackPage.addTrackButton.click();
    await expect(trackPage.trackForm.getByRole('heading', { name: 'Add New Track' })).toBeVisible();

    await trackPage.gameNameInput.fill('Game A');
    await trackPage.trackTitleInput.fill('Track A');
    await trackPage.audioFileInput.setInputFiles({
      name: 'test-audio.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('test audio'),
    });
    await trackPage.addTagButton.click();
    await trackPage.getTagTypeInput().fill('platform');
    await trackPage.getTagValueInput().fill('Platform A');
    await trackPage.saveTrackButton.click();

    const trackCard = trackPage.getTrackCard('Game A');
    await expect(trackCard).toContainText('Track A');
  });
});

test.describe('Track Edit/Delete', () => {
  test.use({ creatorDataFixture: 'single-track' });

  test('should edit a track', async ({ trackPage }) => {
    await trackPage.goto('/tracks');
    const trackCard = trackPage.getTrackCard('Game A');
    await trackCard.getByRole('button', { name: 'Edit' }).click();
    await expect(trackPage.trackForm.getByRole('heading', { name: 'Edit Track' })).toBeVisible();

    await trackPage.gameNameInput.fill('Game B');
    await trackPage.trackTitleInput.fill('Track B');
    await trackPage.updateTrackButton.click();

    const updatedTrackCard = trackPage.getTrackCard('Game B');
    await expect(updatedTrackCard).toContainText('Track B');
  });

  test('should delete a track', async ({ page, trackPage }) => {
    await trackPage.goto('/tracks');
    const trackCard = trackPage.getTrackCard('Game A');

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await trackCard.getByRole('button', { name: 'Delete' }).click();
    expect(await dialogMessage).toBe('Are you sure you want to delete this track?');

    await expect(trackPage.getTrackCard('Game A')).toHaveCount(0);
  });

  test('should close the player when its track is deleted', async ({ page, trackPage }) => {
    await trackPage.goto('/tracks');
    const trackCard = trackPage.getTrackCard('Game A');
    await trackCard.getByRole('button', { name: '▶ Play' }).click();

    const player = page.locator('.central-audio-player');
    await expect(player).toBeVisible();
    await expect(player).toContainText('Track A');

    const dialogMessage = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await trackCard.getByRole('button', { name: 'Delete' }).click();
    expect(await dialogMessage).toBe('Are you sure you want to delete this track?');

    await expect(trackPage.getTrackCard('Game A')).toHaveCount(0);
    await expect(player).toHaveCount(0);
  });
});

test.describe('Track Filtering', () => {
  test.use({ creatorDataFixture: 'multiple-tracks' });

  test('should filter tracks by game name', async ({ trackPage }) => {
    await trackPage.goto('/tracks');
    await expect(trackPage.trackCards).toHaveCount(3);

    await trackPage.searchInput.fill('Game B');
    await expect(trackPage.trackCards).toHaveCount(1);

    await trackPage.clearSearchButton.click();
    await expect(trackPage.searchInput).toHaveValue('');
    await expect(trackPage.trackCards).toHaveCount(3);
  });

  test('should filter tracks by tag', async ({ trackPage }) => {
    await trackPage.goto('/tracks');
    await expect(trackPage.trackCards).toHaveCount(3);

    const platformCategory = trackPage.getTagCategory('platform');
    await platformCategory.locator('.tag-category-header').click();
    await trackPage.getTagCheckbox('Platform B').check();

    await expect(trackPage.trackCards).toHaveCount(2);
    await expect(trackPage.getTrackCard('Game B')).toBeVisible();
    await expect(trackPage.getTrackCard('Game C')).toBeVisible();
    await expect(trackPage.getTrackCard('Game A')).toBeHidden();

    await trackPage.clearTagFiltersButton.click();
    await expect(trackPage.getTagCheckbox('Platform B')).not.toBeChecked();
    await expect(trackPage.trackCards).toHaveCount(3);
  });
});

test.describe('Track Sorting', () => {
  test.use({ creatorDataFixture: 'sorting' });

  test('should sort tracks by game and title', async ({ trackPage }) => {
    await trackPage.goto('/tracks');

    await expect(trackPage.trackNames).toHaveText(['Game C', 'Game A', 'Game B']);

    await trackPage.sortSelect.selectOption('game-asc');
    await expect(trackPage.trackNames).toHaveText(['Game A', 'Game B', 'Game C']);

    await trackPage.sortSelect.selectOption('game-desc');
    await expect(trackPage.trackNames).toHaveText(['Game C', 'Game B', 'Game A']);

    await trackPage.sortSelect.selectOption('title-asc');
    await expect(trackPage.trackNames).toHaveText(['Game A', 'Game C', 'Game B']);

    await trackPage.sortSelect.selectOption('title-desc');
    await expect(trackPage.trackNames).toHaveText(['Game B', 'Game C', 'Game A']);

    await trackPage.sortSelect.selectOption('original-asc');
    await expect(trackPage.trackNames).toHaveText(['Game C', 'Game A', 'Game B']);

    await trackPage.sortSelect.selectOption('original-desc');
    await expect(trackPage.trackNames).toHaveText(['Game B', 'Game A', 'Game C']);
  });
});

test.describe('Accessibility', () => {
  test.use({ creatorDataFixture: 'multiple-tracks' });

  test('should not have any automatically detectable accessibility issues in track list', async ({
    trackPage,
    page,
  }, testInfo) => {
    await trackPage.goto('/tracks');

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

  test('should not have any automatically detectable accessibility issues in track form', async ({
    trackPage,
    page,
  }, testInfo) => {
    await trackPage.goto('/tracks/new');

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
