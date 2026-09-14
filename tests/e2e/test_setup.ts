import { test as base, expect } from '@playwright/test';
import { generatePlayers, Player } from '../utils/helper';
import { TestApi } from '../utils/api';
import { SetupPage } from './pages/SetupPage';
import { LobbyPage } from './pages/LobbyPage';
import { TrackSelectionPage } from './pages/TrackSelectionPage';
import { PlayingPage } from './pages/PlayingPage';
import { HostReviewPage } from './pages/HostReviewPage';
import { RoundResultsPage } from './pages/RoundResultsPage';
import { FinalResultsPage } from './pages/FinalResultsPage';
import { Sidebar } from './pages/components/Sidebar';
import { Header } from './pages/components/Header';
import { LocalSettingsModal } from './pages/components/LocalSettingsModal';

type GameOptions = {
  sessionConfig: {
    playerCount?: number;
    userIndex?: number; // 0 for host, 1+ for regular players
    sessionData?: Record<string, any>;
  };
};

type GameFixtures = {
  session: { players: Player[]; api: TestApi };
  setupPage: SetupPage;
  lobbyPage: LobbyPage;
  trackSelectionPage: TrackSelectionPage;
  playingPage: PlayingPage;
  hostReviewPage: HostReviewPage;
  roundResultsPage: RoundResultsPage;
  finalResultsPage: FinalResultsPage;
  sidebar: Sidebar;
  header: Header;
  localSettingsModal: LocalSettingsModal;
};

export const test = base.extend<GameOptions & GameFixtures>({
  sessionConfig: [{ playerCount: 3, userIndex: 0 }, { option: true }],
  session: [
    async ({ page, sessionConfig }, use, testInfo) => {
      const instanceId = `test-instance-${testInfo.testId}`;
      const players = generatePlayers(sessionConfig.playerCount ?? 3);
      const userIndex = sessionConfig.userIndex ?? 0;
      const user = players[userIndex];

      await page.addInitScript(
        ({ allPlayers, user, instanceId }) => {
          window.__MOCK_PARTICIPANTS__ = allPlayers;
          window.__MOCK_USER_ID__ = user.id;
          window.__MOCK_USER_NAME__ = user.username;
          window.__MOCK_INSTANCE_ID__ = instanceId;
        },
        { allPlayers: players, user, instanceId }
      );

      const api = new TestApi('http://localhost:3001', instanceId);
      const sessionData = sessionConfig.sessionData ?? {};
      await api.setupSession(players, sessionData.state, sessionData);
      await page.goto('/?mock=true');

      // Provide players & api to tests
      await use({ players, api });

      // Teardown
      await api.deleteSession();
    },
    { auto: true },
  ],
  setupPage: async ({ page }, use) => use(new SetupPage(page)),
  lobbyPage: async ({ page }, use) => use(new LobbyPage(page)),
  trackSelectionPage: async ({ page }, use) => use(new TrackSelectionPage(page)),
  playingPage: async ({ page }, use) => use(new PlayingPage(page)),
  hostReviewPage: async ({ page }, use) => use(new HostReviewPage(page)),
  roundResultsPage: async ({ page }, use) => use(new RoundResultsPage(page)),
  finalResultsPage: async ({ page }, use) => use(new FinalResultsPage(page)),
  sidebar: async ({ page }, use) => use(new Sidebar(page)),
  header: async ({ page }, use) => use(new Header(page)),
  localSettingsModal: async ({ page }, use) => use(new LocalSettingsModal(page)),
});

export { expect };
