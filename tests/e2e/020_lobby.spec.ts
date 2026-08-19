import { GameState } from '@yasq/shared';
import { expect, test } from './test_setup.js';
import AxeBuilder from '@axe-core/playwright';

test.describe('Host UI', () => {
  test.use({
    sessionConfig: {
      state: GameState.LOBBY,
      playerCount: 3,
      userIndex: 0,
    },
  });

  test('should toggle start button based on participant ready-state updates', async ({ lobbyPage, session }) => {
    const { api, players } = session;

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

  test('should display correct badges for host and ready status', async ({ sidebar, session }) => {
    const { api, players } = session;
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

  test('should not have any automatically detectable accessibility issues', async ({ lobbyPage, page }, testInfo) => {
    await lobbyPage.waitForLoaded();

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

test.describe('Player UI', () => {
  test.use({
    sessionConfig: {
      state: GameState.LOBBY,
      playerCount: 3,
      userIndex: 1,
    },
  });

  test('should display ready button and toggle status', async ({ lobbyPage, sidebar, session }) => {
    const player = session.players[1];

    // Verify Ready Button Visible
    await expect(lobbyPage.readyBtn).toBeVisible();
    await expect(lobbyPage.readyBtn).toHaveText('Ready Up');

    // Click the Ready button
    await lobbyPage.readyBtn.click();

    // Verify the button text changes
    await expect(lobbyPage.readyBtn).toHaveText("I'm Ready! ✅");

    // Verify the Badge appears in the player list
    await expect(sidebar.getBadge(player.username, 'ready')).toBeVisible();

    // Click the Ready button again
    await lobbyPage.readyBtn.click();

    // Verify the button text changes
    await expect(lobbyPage.readyBtn).toHaveText('Ready Up');

    // Verify the Badge disappears in the player list
    await expect(sidebar.getBadge(player.username, 'ready')).toBeHidden();
  });

  test('should not have any automatically detectable accessibility issues', async ({ lobbyPage, page }, testInfo) => {
    await lobbyPage.waitForLoaded();

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
