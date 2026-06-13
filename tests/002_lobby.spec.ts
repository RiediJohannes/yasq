import { test, expect } from '@playwright/test';
import { generatePlayers, Player } from './helper.js'
import { LobbyPage } from './pages/LobbyPage.js';
import { TestApi } from './api.js';
import { Sidebar } from './pages/components/Sidebar.js';

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
    api = new TestApi(request, currentInstanceId);
    await api.setupSession(players, 'LOBBY');

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should toggle start button based on participant ready-state updates', async ({ page, request }) => {
    const lobbyPage = new LobbyPage(page);

    // Check for the Start Game button
    await expect(lobbyPage.startBtn).toBeVisible();
    await expect(lobbyPage.startBtn).toBeDisabled();

    // MockPlayer1 is ready
    await api.setReady(players[1], true);

    // Not all players ready yet
    await expect(lobbyPage.startBtn).toBeDisabled();

    // MockPlayer2 is ready
    await api.setReady(players[2], true);

    // Button enabled when all players are ready
    await expect(lobbyPage.startBtn).toBeEnabled();

    // MockPlayer2 is no longer ready
    await api.setReady(players[2], false);

    // Button disabled again
    await expect(lobbyPage.startBtn).toBeDisabled();
  });

  test('should display correct badges for host and ready status', async ({ page, request }) => {
    const sidebar = new Sidebar(page);

    const host = players[0];
    const player = players[1];

    // Check for the HOST badge
    await expect(sidebar.getBadge(host.username, 'host')).toBeVisible();
    await expect(sidebar.getBadge(host.username, 'host')).toHaveText('HOST');

    // Set ready and check for the READY badge
    await api.setReady(player, true);
    await expect(sidebar.getBadge(player.username, 'ready')).toBeVisible();
    await expect(sidebar.getBadge(player.username, 'ready')).toHaveText('READY');

    // Unset ready and check badge gone
    await api.setReady(player, false);
    await expect(sidebar.getBadge(player.username, 'ready')).toBeHidden();
  });
});

test.describe('Player UI', () => {

  let players: Player[] = [];
  let currentInstanceId: string;
  let api: TestApi;

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

    // Setup current game state
    api = new TestApi(request, currentInstanceId);
    await api.setupSession(players, 'LOBBY');

    // Navigate to the app
    await page.goto('/?mock=true');
  });

  test.afterEach(async () => {
    await api.deleteSession();
  });

  test('should display ready button and toggle status', async ({ page }) => {
    const lobby = new LobbyPage(page);
    const sidebar = new Sidebar(page);
    const player = players[1];

    // Verify Ready Button Visible
    await expect(lobby.readyBtn).toBeVisible();
    await expect(lobby.readyBtn).toHaveText("Ready Up");

    // Click the Ready button
    await lobby.readyBtn.click();

    // Verify the button text changes
    await expect(lobby.readyBtn).toHaveText("I'm Ready! ✅");

    // Verify the Badge appears in the player list
    await expect(sidebar.getBadge(player.username, 'ready')).toBeVisible();

    // Click the Ready button again
    await lobby.readyBtn.click();

    // Verify the button text changes
    await expect(lobby.readyBtn).toHaveText("Ready Up");

    // Verify the Badge disappears in the player list
    await expect(sidebar.getBadge(player.username, 'ready')).toBeHidden();
  });
});