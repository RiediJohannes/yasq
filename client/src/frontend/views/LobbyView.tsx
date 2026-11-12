import { gameStatus, participants, useBackend } from '@globals';
import { ReadyButton } from '@components/ReadyButton';
import { InviteButton } from '@components/InviteButton';
import { GameSettings } from '@components/GameSettings';

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const backend = useBackend();

  const playersExcludingHost = participants.value.filter(p => p.id !== gameStatus.value.hostId);
  const readyPlayers = playersExcludingHost.filter(p => gameStatus.value.readyPlayers.includes(p.id)).length;
  const allPlayersAreReady = playersExcludingHost.length > 0 && readyPlayers === playersExcludingHost.length;

  const handleStart = async () => {
    await backend.startGame();
  };

  const handleEditSettings = async () => {
    await backend.restartGame();
  };

  return (
    <div
      id="lobby"
      className="centered"
    >
      <div
        id="settings-summary"
        className="card-container"
      >
        <h2>Game Settings</h2>
        <hr className="divider" />

        <GameSettings onSettingsEdit={isHost ? handleEditSettings : undefined} />
      </div>

      <div className="lobby-footer">
        {isHost ? (
          <>
            <button
              id="btn-start"
              disabled={!allPlayersAreReady}
              onClick={handleStart}
            >
              {allPlayersAreReady ? 'Start Game' : `Waiting... (${readyPlayers}/${playersExcludingHost.length})`}
            </button>
            <InviteButton />
          </>
        ) : (
          <ReadyButton promptText={'Ready Up'} />
        )}
      </div>
    </div>
  );
};
