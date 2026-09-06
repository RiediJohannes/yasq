import { createContext, render } from 'preact';
import { signal } from '@preact/signals';
import { useContext } from 'preact/hooks';

import { GameStatus } from './utils/types';
import { getUserId } from './utils/helper';
import { showKeyboardHints } from './utils/showKeyboardHints';
import { themePreference, ThemePreference } from './utils/switchTheme';
import {
  AbstractDiscordSdk,
  authenticateWithDiscord,
  AuthenticationResult,
  establishServerConnection,
  getDiscordSdk,
  syncParticipants,
} from './utils/connections';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { DEFAULT_VOLUME_SLIDER_VAL, GameSettings, GameState, MAX_VOLUME, Participant } from '@yasq/shared';

import { GameHeader, isLocalSettingsOpen } from './components/GameHeader';
import { Modal } from './components/Modal';
import { RadioGroup } from './components/RadioGroup';
import { Sidebar } from './components/Sidebar';
import { LoadingState } from './components/LoadingSpinner';

import { SetupView } from './views/SetupView';
import { LobbyView } from './views/LobbyView';
import { TrackSelectionView } from './views/TrackSelectionView';
import { PlayingView } from './views/PlayingView';
import { HostReviewView } from './views/HostReviewView';
import { RoundResultsView } from './views/RoundResultsView';
import { FinalResultsView } from './views/FinalResultsView';

import './style.css';

const authState = signal<AuthenticationResult | null>(null);
export const discordSdk: AbstractDiscordSdk = getDiscordSdk();
export const participants = signal<Participant[]>([]);

export const gameState = signal<GameStatus>({
  state: GameState.LOBBY,
  hostId: null,
  readyUsers: [],
  guessedPlayers: [],
  currentRound: 0,
  lastWinnerId: null,
  gameSettings: GameSettings.withJokerArray(),
  streaks: {},
  lostStreaks: {},
});
export const volume = signal(DEFAULT_VOLUME_SLIDER_VAL);

export const audioPlayer = new Audio();
audioPlayer.loop = true;
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const source = audioContext.createMediaElementSource(audioPlayer);

export const gainNode = audioContext.createGain();
source.connect(gainNode);
gainNode.connect(audioContext.destination);
gainNode.gain.value = DEFAULT_VOLUME_SLIDER_VAL * MAX_VOLUME;

export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export const isInitializing = signal<boolean>(true);
export const initError = signal<string | null>(null);

export const triggerManualReconnect = async () => {
  if (isInitializing.value) return;

  await initializeApplication();
};

const AuthContext = createContext<AuthenticationResult>(null!);
export const useAuth = () => useContext(AuthContext);

const App = () => {
  useKeyboardShortcut({ key: 'Q', altKey: !isMac, metaKey: isMac }, () => {
    void triggerManualReconnect();
  });

  if (initError.value && !isInitializing.value) {
    return (
      <>
        <div className="centered">
          <div className="error-box">
            <h1 className="error-title">Connection Failed</h1>
            <p className="error-hint">Please leave and re-open the activity</p>
          </div>
        </div>
        <footer>
          <span className="error-message">Error: {initError.value}</span>
        </footer>
      </>
    );
  }

  if (!authState.value) return <LoadingState label="Authenticating" />;

  if (gameState.value.hostId === null) {
    return <LoadingState label="Starting Game" />;
  }

  const isHost = String(getUserId(authState.value)) === String(gameState.value.hostId);
  const authenticationResult = authState.value;

  return (
    <AuthContext.Provider value={authenticationResult}>
      <div className="container">
        <div className="game-column">
          <GameHeader />
          <main
            className="game-area"
            key={`view-${isHost}-${gameState.value.state}`}
            tabIndex={0}
          >
            {renderView(isHost)}
          </main>
          <Modal
            isOpen={isLocalSettingsOpen.value}
            onClose={() => (isLocalSettingsOpen.value = false)}
            title="Local Settings"
            width="400px"
          >
            <div className="local-settings">
              <div className="setting-item">
                <span>Colour Scheme</span>
                <RadioGroup<ThemePreference>
                  groupId="theme-group"
                  name="theme"
                  options={[
                    { label: 'Auto', value: 'auto' },
                    { label: 'Dark', value: 'dark' },
                    { label: 'Light', value: 'light' },
                  ]}
                  value={themePreference.value}
                  onChange={val => (themePreference.value = val)}
                />
              </div>

              <div className="setting-item shortcut-badge-settings">
                <span>Keyboard Hints</span>
                <RadioGroup<boolean>
                  groupId="keyboard-hints-group"
                  name="keyboard-hints"
                  options={[
                    { label: 'Show', value: true },
                    { label: 'Hide', value: false },
                  ]}
                  value={showKeyboardHints.value}
                  onChange={val => (showKeyboardHints.value = val)}
                />
              </div>
            </div>
          </Modal>
        </div>
        <Sidebar />
      </div>
      <footer>
        <p className="version">Ver. {import.meta.env.VERSION}</p>
      </footer>
    </AuthContext.Provider>
  );
};

const renderView = (isHost: boolean) => {
  switch (gameState.value.state) {
    case GameState.SETUP:
      return <SetupView isHost={isHost} />;
    case GameState.LOBBY:
      return <LobbyView isHost={isHost} />;
    case GameState.TRACK_SELECTION:
      return <TrackSelectionView isHost={isHost} />;
    case GameState.PLAYING:
      return <PlayingView isHost={isHost} />;
    case GameState.HOST_REVIEW:
      return <HostReviewView isHost={isHost} />;
    case GameState.ROUND_RESULTS:
      return <RoundResultsView isHost={isHost} />;
    case GameState.FINAL_RESULTS:
      return <FinalResultsView isHost={isHost} />;
  }
};

render(<App />, document.getElementById('app')!);

export const initializeApplication = async () => {
  isInitializing.value = true;
  initError.value = null;
  console.log(`\n=== STARTING INITIALIZATION (${import.meta.env.MODE}) ===`);

  try {
    // Authenticate user with the Discord backend
    authState.value = await authenticateWithDiscord(discordSdk);

    // Establish a bidirectional socket connection to the YASQ server
    establishServerConnection(discordSdk.instanceId, authState.value.access_token);

    // Sync local information of the activity's participants with the backend
    await syncParticipants(discordSdk, participants);
  } catch (error: any) {
    console.error('[INIT] Initialization Failed:', error);
    initError.value = error.message || 'An unknown connection error occurred.';
  } finally {
    isInitializing.value = false;
    console.log('=== INITIALIZATION COMPLETE ===\n');
  }
};

// Initial boot
void initializeApplication();
