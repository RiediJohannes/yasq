import { render } from 'preact';
import { signal } from '@preact/signals';

import { backend, BackendContext, discordSdk, gameStatus, isMac, participants } from './globals';
import { authenticateWithDiscord, establishServerConnection, syncParticipants } from './backend/connections';
import { useKeyboardShortcut } from './frontend/hooks/useKeyboardShortcut';
import { GamePhase } from '@yasq/shared';

import { GameHeader, isHowToPlayOpen, isLocalSettingsOpen } from '@components/GameHeader';
import { HowToPlay } from '@components/HowToPlay';
import { LocalSettings } from '@components/LocalSettings';
import { Modal } from '@components/Modal';
import { Sidebar } from '@components/Sidebar';
import { LoadingState } from '@components/LoadingSpinner';

import { SetupView } from '@views/SetupView';
import { LobbyView } from '@views/LobbyView';
import { TrackSelectionView } from '@views/TrackSelectionView';
import { PlayingView } from '@views/PlayingView';
import { HostReviewView } from '@views/HostReviewView';
import { RoundResultsView } from '@views/RoundResultsView';
import { FinalResultsView } from '@views/FinalResultsView';

import './style.css';

const isInitializing = signal<boolean>(true);
const initError = signal<string | null>(null);

export const triggerManualReconnect = async () => {
  if (isInitializing.value) return;

  await initializeApplication();
};

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

  const activeBackend = backend.value;

  if (!activeBackend) return <LoadingState label="Authenticating" />;

  if (gameStatus.value.hostId === null) {
    return <LoadingState label="Starting Game" />;
  }

  const isHost = activeBackend.userId === String(gameStatus.value.hostId);

  return (
    <BackendContext.Provider value={activeBackend}>
      <div className="container">
        <div className="game-column">
          <GameHeader />

          <main
            className="game-area"
            key={`view-${isHost}-${gameStatus.value.state}`}
            tabIndex={0}
          >
            {renderView(isHost)}
          </main>

          <Modal
            id="local-settings-modal"
            isOpen={isLocalSettingsOpen}
            title="Local Settings"
            width="400px"
          >
            <LocalSettings />
          </Modal>

          <Modal
            id="how-to-play-modal"
            isOpen={isHowToPlayOpen}
            title="How to Play"
            width="1000px"
          >
            <HowToPlay isHost={isHost} />
          </Modal>
        </div>
        <Sidebar />
      </div>
      <footer>
        <p className="version">Ver. {import.meta.env.VERSION}</p>
      </footer>
    </BackendContext.Provider>
  );
};

const renderView = (isHost: boolean) => {
  switch (gameStatus.value.state.phase) {
    case GamePhase.SETUP:
      return <SetupView isHost={isHost} />;
    case GamePhase.LOBBY:
      return <LobbyView isHost={isHost} />;
    case GamePhase.TRACK_SELECTION:
      return <TrackSelectionView isHost={isHost} />;
    case GamePhase.PLAYING:
      return <PlayingView isHost={isHost} />;
    case GamePhase.HOST_REVIEW:
      return <HostReviewView isHost={isHost} />;
    case GamePhase.ROUND_RESULTS:
      return <RoundResultsView isHost={isHost} />;
    case GamePhase.FINAL_RESULTS:
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
    backend.value = await authenticateWithDiscord(discordSdk);

    // Establish a bidirectional socket connection to the YASQ server
    establishServerConnection(discordSdk.instanceId, backend.value.accessToken);

    // Sync local information of the activity's participants with the Discord backend
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
