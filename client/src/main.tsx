import { render } from 'preact';
import { signal } from '@preact/signals';
import { DiscordSDK } from "@discord/embedded-app-sdk";

import * as backend from "./utils/backend";
import { getUserId } from "./utils/helper";
import { Participant, GameStatus } from "./utils/types";
import { GameState, MAX_VOLUME, DEFAULT_VOLUME_SLIDER_VAL, POLLING_INTERVAL } from '@yasq/shared';
import { mockDiscordSdk } from "../../mock_data/mockDiscordSdk";

import { GameHeader } from './components/GameHeader';
import { Sidebar } from './components/Sidebar';

import { SetupView } from './views/SetupView';
import { LobbyView } from "./views/LobbyView";
import { SelectionView } from "./views/TrackSelectionView";
import { ArenaView } from "./views/PlayingView";
import { HostReviewView } from "./views/RoundCompletedView";
import { RoundResultsView } from "./views/ResultsView";
import { FinalResultsView } from "./views/GameFinishedView";

import "./style.css";

const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';
export const discordSdk = isMockMode ? mockDiscordSdk : new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

export const auth = signal<any | null>(null);
export const gameState = signal<GameStatus>({
  state: GameState.LOBBY,
  hostId: null,
  readyUsers: [],
  guessedPlayers: [],
  currentRound: 0,
  isFinalRound: false,
  lastWinnerId: null,
  rounds: 0,
  trackDuration: 0,
  enabledJokers: []
});
export const participants = signal<Participant[]>([]);
export const volume = signal(DEFAULT_VOLUME_SLIDER_VAL);

export const audioPlayer = new Audio();
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const source = audioContext.createMediaElementSource(audioPlayer);
export const gainNode = audioContext.createGain();
source.connect(gainNode);
gainNode.connect(audioContext.destination);
gainNode.gain.value = DEFAULT_VOLUME_SLIDER_VAL * MAX_VOLUME;

const App = () => {
  if (!auth.value) return <div className="centered">Authenticating...</div>;

  if (gameState.value.hostId === null) {
    return <div className="centered">Starting Game...</div>;
  }

  const isHost = String(getUserId(auth.value)) === String(gameState.value.hostId);

  return (
    <>
      <div className="container">
        <div className="game-column">
          <GameHeader />
          <div className="game-area" key={`view-${isHost}-${gameState.value.state}`}>
            {renderView(isHost)}
          </div>
        </div>
        <Sidebar />
      </div>
      <p className="version">Ver. {import.meta.env.VERSION}</p>
    </>
  );
};

const renderView = (isHost: boolean) => {
  switch (gameState.value.state) {
    case GameState.SETUP:
      return <SetupView isHost={isHost} />
    case GameState.LOBBY:
      return <LobbyView isHost={isHost} />;
    case GameState.TRACK_SELECTION:
      return <SelectionView isHost={isHost} />;
    case GameState.PLAYING:
      return <ArenaView isHost={isHost} />;
    case GameState.ROUND_COMPLETED:
      return <HostReviewView isHost={isHost} />;
    case GameState.RESULTS:
      return <RoundResultsView isHost={isHost} />;
    case GameState.GAME_FINISHED:
      return <FinalResultsView isHost={isHost} />;
  }
};

render(<App />, document.getElementById('app')!);

(async () => {
  await discordSdk.ready();
  console.log("Discord SDK is ready");

  // Authorize with Discord Client
  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: [
      "identify",
      "guilds",
      "applications.commands"
    ],
  });

  // Retrieve an access_token from your activity's server
  const { access_token } = await backend.getToken(code);

  // Authenticate with Discord client (using the access_token)
  auth.value = await discordSdk.commands.authenticate({ access_token });

  if (auth.value == null) {
    throw new Error("Authenticate command failed");
  }

  window.addEventListener('pagehide', () => {
    backend.deregisterUser(auth.value.access_token, discordSdk.instanceId);
  });

  // Register with our backend
  await backend.registerUser(auth.value.access_token, discordSdk.instanceId);

  setInterval(async () => {
    gameState.value  = await backend.getGameStatus(discordSdk.instanceId);
  }, POLLING_INTERVAL);

  participants.value = (await discordSdk.commands.getInstanceConnectedParticipants()).participants;
  discordSdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', (e: any) => participants.value = e.participants);

  render(<App />, document.getElementById('app')!);
})();