import { expect, test } from './test_setup.js';
import sessionData from '../../mock_data/fixtures/track_selection.json';

test.use({
  sessionConfig: {
    playerCount: 3,
    userIndex: 0,
    sessionData: sessionData,
  },
});

test.describe('Host UI', () => {
  test('should move to next state when clicking on track', async ({ trackSelectionPage, playingPage }) => {
    // Click the first track
    await trackSelectionPage.selectTrack(0);

    // Verify the state transition in the UI
    await expect(trackSelectionPage.selectionTitle).toBeHidden();
    await expect(trackSelectionPage.waitingTitle).toBeVisible();
    await expect(playingPage.countdownOverlay).toBeVisible();
  });
});
