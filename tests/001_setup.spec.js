import { test, expect } from '@playwright/test';
import { generatePlayers } from './helper.js'

test.describe('Host UI', () => {

  let players = [];
  let currentInstanceId;

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

    await request.post('http://localhost:3001/api/test/setup-session', {
      data: {
        instanceId: currentInstanceId,
        hostId: players[0].id,
        registeredUsers: players,
        state: 'SETUP',
        readyUserIds: []
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`http://localhost:3001/api/test/instance/${currentInstanceId}`);
  });

  test('should allow host to select another player and transfer host role', async ({ page }) => {
    await expect(page.locator('#host-settings')).toBeVisible();
    await expect(page.locator('#waiting-setup-msg')).toBeHidden();

    const targetPlayer = players[2];
    const dropdown = page.locator('#host-dropdown');
    const listContainer = page.locator('#dropdown-list');
    const transferBtn = page.locator('#btn-confirm-transfer');

    // Open the dropdown
    await dropdown.click();
    await expect(listContainer).toBeVisible();

    // Select the target player from the list
    const playerItem = listContainer.locator(`.dropdown-item[data-id="${targetPlayer.id}"]`);
    await playerItem.click();

    // Verify selection state
    await expect(listContainer).toBeHidden();
    await expect(transferBtn).toBeEnabled();

    // Verify the header updated with the selected player's name
    await expect(dropdown).toContainText(targetPlayer.username);

    // Execute the transfer
    await transferBtn.click();

    // Assertions for the "After" state
    await expect(transferBtn).toHaveText(/transferring/i);

    // Once the backend processes this, the host UI is replaced by the guesser UI
    await expect(page.locator('#host-settings')).toBeHidden();
    await expect(page.locator('#waiting-setup-msg')).toBeVisible();
  });
});