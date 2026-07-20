import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from '../utils/helper.js'
import { TrackSelectionPage } from './pages/TrackSelectionPage.js';
import { TestApi } from '../utils/api.js';

test.describe('Host UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 3;
    players = generatePlayers(playerCount);
    const user = players[0];

    await page.addInitScript(({ allPlayers, user, instanceId }) => {
      window.__MOCK_PARTICIPANTS__ = allPlayers;
      window.__MOCK_USER_ID__ = user.id;
      window.__MOCK_USER_NAME__ = user.username;
      window.__MOCK_INSTANCE_ID__ = instanceId;
    }, { allPlayers: players, user: user, instanceId: currentInstanceId });

    // Setup current game state
    api = new TestApi('http://localhost:3001', currentInstanceId);
    await api.setupSession(players, 'TRACK_SELECTION', {
      trackHistory: ["track003.mp3"]
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should show track selection', async ({ page }) => {
    const trackSelection = new TrackSelectionPage(page);
    await expect(trackSelection.selectionTitle).toBeVisible();

    // Verify the list of tracks is rendered
    await expect(trackSelection.trackList).toBeVisible();

    // Verify there are track items
    expect(await trackSelection.trackItems.count()).toBeGreaterThan(0);
  });

  test('should move to next state when clicking on track', async ({ page }) => {
    const trackSelection = new TrackSelectionPage(page);

    // Click the first track
    await trackSelection.selectTrack(0);

    // Verify the state transition in the UI
    await expect(trackSelection.selectionTitle).toBeHidden();
    await expect(trackSelection.waitingTitle).toBeVisible();
    await expect(trackSelection.progressBar).toBeVisible();
  });

  test('should filter tracks when searching', async ({ page }) => {
    const trackSelection = new TrackSelectionPage(page);
    await expect(trackSelection.trackList).toBeVisible();

    // Initial mock track count
    expect(await trackSelection.trackItems.count()).toBe(4);

    // Search for all tracks with "B" in name or title
    await trackSelection.searchInput.fill('B');

    // Find exactly one game ("Game B")
    expect(await trackSelection.trackItems.count()).toBe(1);
  });

  test('should filter tracks when filtering by tags', async ({ page }) => {
    const trackSelection = new TrackSelectionPage(page);
    await expect(trackSelection.trackList).toBeVisible();

    // Initial mock track count (4)
    expect(await trackSelection.trackItems.count()).toBe(4);

    // Open tag filter dropdown
    await trackSelection.tagFilterDropdown.filter({ hasText: 'Filter by Tags' }).click();

    // Select Platform C
    await trackSelection.selectTag('Platform C');

    // Verify tracks are filtered to show only those matching Platform C (2)
    expect(await trackSelection.trackItems.count()).toBe(2);

    // Select Year 2026
    await trackSelection.selectTag('2026');

    // Verify tracks are filtered to show only those matching both Platform C and 2026 (1)
    expect(await trackSelection.trackItems.count()).toBe(1);

    // Clear all filters
    await trackSelection.tagFilterDropdown.filter({ hasText: 'Filters (2)' }).click({ force: true });
    await trackSelection.clearFiltersButton.click();

    // Verify all tracks are visible again after clearing filters (1)
    expect(await trackSelection.trackItems.count()).toBe(4);
  });

  test('should filter tracks when hiding played tracks', async ({ page }) => {
    const trackSelection = new TrackSelectionPage(page);
    await expect(trackSelection.trackList).toBeVisible();

    // Initial mock track count (4)
    expect(await trackSelection.trackItems.count()).toBe(4);

    // Hide all played tracks
    await trackSelection.hidePlayedCheckbox.check();

    // Find exactly three games (excluding "Game C")
    expect(await trackSelection.trackItems.count()).toBe(3);
  });
});