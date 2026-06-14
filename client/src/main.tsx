import { render } from 'preact';
import { signal } from '@preact/signals';
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { io } from 'socket.io-client';

import * as backend from "./utils/backend";
import { getUserId } from "./utils/helper";
import { GameStatus, Participant } from "./utils/types";
import {
  DEFAULT_VOLUME_SLIDER_VAL,
  GameState,
  GameSettings,
  Joker,
  MAX_VOLUME,
  WS_GAME_STATUS_UPDATE_EVENT,
  WS_JOIN_INSTANCE_EVENT
} from '@yasq/shared';
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
  lastWinnerId: null,
  gameSettings: new GameSettings<Joker[]>(),
  streaks: {},
  lostStreaks: {}
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

  // Establish a websocket communication for continuous game state updates
  const socket = io({ auth: { token: auth.value.access_token } });
  // Register this client-socket with the current quiz instance
  socket.emit(WS_JOIN_INSTANCE_EVENT, { instanceId: discordSdk.instanceId });

  // Update the client-side game state whenever the server pushes an update
  socket.on(WS_GAME_STATUS_UPDATE_EVENT, (updatedState) => {
    gameState.value = updatedState;
  });

  participants.value = (await discordSdk.commands.getInstanceConnectedParticipants()).participants;
  discordSdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', (e: any) => participants.value = e.participants);

  render(<App />, document.getElementById('app')!);
})();