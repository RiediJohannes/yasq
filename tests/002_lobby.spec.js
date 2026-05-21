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
        state: 'LOBBY',
        readyUserIds: []
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`http://localhost:3001/api/test/instance/${currentInstanceId}`);
  });

  test('should toggle start button based on participant ready-state updates', async ({ page }) => {
    // Check for the Start Game button
    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeDisabled();

    // MockPlayer1 is ready
    await page.request.post('http://localhost:3001/api/ready', {
      data: { instanceId: currentInstanceId, ready: true },
      headers: {
        'Authorization': `Bearer token_${players[1].id}`,
        'Content-Type': 'application/json'
      }
    });

    // Not all players ready yet
    await expect(startBtn).toBeDisabled();

    // MockPlayer2 is ready
    await page.request.post('http://localhost:3001/api/ready', {
      data: { instanceId: currentInstanceId, ready: true },
      headers: {
        'Authorization': `Bearer token_${players[2].id}`,
        'Content-Type': 'application/json'
      }
    });

    // Button enabled when all players are ready
    await expect(startBtn).toBeEnabled();

    // MockPlayer2 is no longer ready
    await page.request.post('http://localhost:3001/api/ready', {
      data: { instanceId: currentInstanceId, ready: false },
      headers: {
        'Authorization': `Bearer token_${players[2].id}`,
        'Content-Type': 'application/json'
      }
    });

    // Button disabled again
    await expect(startBtn).toBeDisabled();
  });

  test('should display correct badges for host and ready status', async ({ page, request }) => {
    const host = players[0];
    const guest = players[1];

    // Check for the HOST badge
    const hostEntry = page.locator(`.player-entry:has-text("${host.username}")`);
    await expect(hostEntry.locator('.badge.host')).toBeVisible();
    await expect(hostEntry.locator('.badge.host')).toHaveText('HOST');

    // Check for the READY badge
    await request.post('http://localhost:3001/api/ready', {
      data: { instanceId: currentInstanceId, ready: true },
      headers: {
        'Authorization': `Bearer token_${guest.id}`,
        'Content-Type': 'application/json'
      }
    });

    const playerEntry = page.locator(`.player-entry:has-text("${guest.username}")`);
    await expect(playerEntry.locator('.badge.ready')).toBeVisible();
    await expect(playerEntry.locator('.badge.ready')).toHaveText('READY');

    await request.post('http://localhost:3001/api/ready', {
      data: { instanceId: currentInstanceId, ready: false },
      headers: {
        'Authorization': `Bearer token_${guest.id}`,
        'Content-Type': 'application/json'
      }
    });

    await expect(playerEntry.locator('.badge.ready')).toBeHidden();
  });
});

test.describe('Player UI', () => {

  let players = [];
  let currentInstanceId;

  test.beforeEach(async ({ page, request }, testInfo) => {
    currentInstanceId = `test-instance-${testInfo.testId}`;
    const playerCount = 3;
    players = generatePlayers(playerCount);
    const user = players[1];

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
        state: 'LOBBY',
        readyUserIds: []
      }
    });

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test('should display ready button and toggle status', async ({ page, request }) => {
    // Verify Ready Button Visible
    const readyBtn = page.locator('#btn-ready');
    await expect(readyBtn).toBeVisible();
    await expect(readyBtn).toHaveText('Ready Up');

    // Click the Ready button
    await readyBtn.click();

    // Verify the button text changes
    await expect(readyBtn).toHaveText("I'm Ready! ✅");

    // Verify the Badge appears in the player list
    const localPlayerRow = page.locator(`.player-entry:has-text("${players[1].username}")`);
    await expect(localPlayerRow.locator('.badge.ready')).toBeVisible();

    // Click the Ready button again
    await readyBtn.click();

    // Verify the button text changes
    await expect(readyBtn).toHaveText("Ready Up");

    // Verify the Badge disappears in the player list
    await expect(localPlayerRow.locator('.badge.ready')).toBeHidden();
  });
});