import { GameState } from '@yasq/shared';
import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';

test.use({
  sessionConfig: {
    state: GameState.TRACK_SELECTION,
    playerCount: 3,
    userIndex: 0,
    sessionData: {
      trackHistory: ['track003.mp3'],
    },
  },
});

test.describe('Host UI', () => {
  test('should show track selection', async ({ trackSelectionPage }) => {
    await expect(trackSelectionPage.selectionTitle).toBeVisible();

    // Verify the list of tracks is rendered
    await expect(trackSelectionPage.trackList).toBeVisible();

    // Verify there are track items
    expect(await trackSelectionPage.trackItems.count()).toBeGreaterThan(0);
  });

  test('should move to next state when clicking on track', async ({ trackSelectionPage }) => {
    // Click the first track
    await trackSelectionPage.selectTrack(0);

    // Verify the state transition in the UI
    await expect(trackSelectionPage.selectionTitle).toBeHidden();
    await expect(trackSelectionPage.waitingTitle).toBeVisible();
    await expect(trackSelectionPage.progressBar).toBeVisible();
  });

  test('should filter tracks when searching', async ({ trackSelectionPage }) => {
    await expect(trackSelectionPage.trackList).toBeVisible();

    // Initial mock track count
    expect(await trackSelectionPage.trackItems.count()).toBe(4);

    // Search for all tracks with "B" in name or title
    await trackSelectionPage.searchInput.fill('B');

    // Find exactly one game ("Game B")
    expect(await trackSelectionPage.trackItems.count()).toBe(1);
  });

  test('should filter tracks when filtering by tags', async ({ trackSelectionPage }) => {
    await expect(trackSelectionPage.trackList).toBeVisible();

    // Initial mock track count (4)
    expect(await trackSelectionPage.trackItems.count()).toBe(4);

    // Open tag filter dropdown
    await trackSelectionPage.tagFilterDropdown.filter({ hasText: 'Filter by Tags' }).click();

    // Select Platform C
    await trackSelectionPage.selectTag('Platform C');

    // Verify tracks are filtered to show only those matching Platform C (2)
    expect(await trackSelectionPage.trackItems.count()).toBe(2);

    // Select Year 2026
    await trackSelectionPage.selectTag('2026');

    // Verify tracks are filtered to show only those matching both Platform C and 2026 (1)
    expect(await trackSelectionPage.trackItems.count()).toBe(1);

    // Clear all filters
    await trackSelectionPage.tagFilterDropdown.filter({ hasText: 'Filters (2)' }).click({ force: true });
    await trackSelectionPage.clearFiltersButton.click();

    // Verify all tracks are visible again after clearing filters (4)
    expect(await trackSelectionPage.trackItems.count()).toBe(4);
  });

  test('should filter tracks when hiding played tracks', async ({ trackSelectionPage }) => {
    await expect(trackSelectionPage.trackList).toBeVisible();

    // Initial mock track count (4)
    expect(await trackSelectionPage.trackItems.count()).toBe(4);

    // Hide all played tracks
    await trackSelectionPage.hidePlayedCheckbox.check();

    // Find exactly three games (excluding "Game C")
    expect(await trackSelectionPage.trackItems.count()).toBe(3);
  });

  test('should not have any automatically detectable accessibility issues', async ({
    trackSelectionPage,
    page,
  }, testInfo) => {
    await trackSelectionPage.waitForLoaded();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'page-has-heading-one'])
      .analyze();

    await testInfo.attach('violations', {
      body: JSON.stringify(accessibilityScanResults.violations, null, 2),
      contentType: 'application/json',
    });

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
