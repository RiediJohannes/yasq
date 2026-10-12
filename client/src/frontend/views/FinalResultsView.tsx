import { useSignal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';

import { audioPlayer, discordSdk, gameStatus, participants, useBackend } from '@yasq/client/src/globals';
import { Leaderboard } from '@components/Leaderboard';
import { LoadingSpinner } from '@components/LoadingSpinner';
import { GameStatsSummary } from '@components/GameStatsSummary';
import { ReadyButton } from '@components/ReadyButton';

export const FinalResultsView = ({ isHost }: { isHost: boolean }) => {
  const backend = useBackend();
  const leaderboard = useSignal<any[]>([]);
  const gameStats = useSignal<any>({});
  const achievements = useSignal<Record<string, any>>({});
  const [canExport, setCanExport] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [hasPosted, setHasPosted] = useState(false);
  const [channels, setChannels] = useState<{ id: string; name: string; category: string }[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');

  useEffect(() => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';

    backend.getFinalResults().then((data: any) => {
      leaderboard.value = data.leaderboard;
      gameStats.value = data.gameStats;
      achievements.value = data.achievementBonuses;
      setCanExport(data.canExport);
    });
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    await backend.downloadResultsImage(discordSdk);
    setIsDownloading(false);
  };

  const handlePostToChannel = async () => {
    setIsPosting(true);
    try {
      const response = await backend.postResultsToDiscordChannel(selectedChannel);

      if (response.ok) {
        setHasPosted(true);
      } else {
        console.error('Failed to post results package.');
      }
    } catch (error) {
      console.error('Error running post routine:', error);
    } finally {
      setIsPosting(false);
    }
  };

  useEffect(() => {
    if (!isHost) return;

    backend.getDiscordChannels(discordSdk.guildId!).then((data: any) => setChannels(data));
  }, [isHost]);

  const playersExcludingHost = participants.value.filter(p => p.id !== gameStatus.value.hostId);
  const readyCount = gameStatus.value.readyPlayers.length;
  const allPlayersReady =
    playersExcludingHost.length > 0 && playersExcludingHost.every(p => gameStatus.value.readyPlayers.includes(p.id));

  const handleRestart = async (e: MouseEvent) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    await backend.restartGame();
  };

  const totalPlayers = leaderboard.value.length;
  const lastItemDelay = totalPlayers > 0 ? (totalPlayers - 1) * 1.5 : 0;
  const animationBuffer = 1.2; // Time for the last card's wrapper/fade animation to finish
  const statsAndControlsAnimationDelay = totalPlayers > 0 ? lastItemDelay + animationBuffer : 0;

  if (leaderboard.value.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="final-leaderboard centered">
      <h1 className="results-title">🏆 Final Results</h1>

      <Leaderboard
        leaderboard={leaderboard.value}
        achievements={achievements.value}
        participants={participants.value}
      />

      <div
        className="stats-and-controls"
        style={{ animationDelay: `${statsAndControlsAnimationDelay}s` }}
      >
        <GameStatsSummary
          stats={gameStats.value}
          achievements={achievements.value}
          participants={participants.value}
        />

        {isHost ? (
          <div>
            {canExport && (
              <div className="export-section">
                <button
                  id="btn-download-image"
                  onClick={handleDownload}
                  disabled={isDownloading}
                >
                  {isDownloading ? 'Downloading...' : '📥 Download Results Image'}
                </button>

                <select
                  value={selectedChannel}
                  disabled={channels.length === 0 || isPosting || hasPosted}
                  onChange={e => {
                    const target = e.target as HTMLSelectElement;
                    setSelectedChannel(target.value);
                  }}
                >
                  {channels.length === 0 ? (
                    <option value="">No channels available</option>
                  ) : (
                    <>
                      <option value="">Select a channel...</option>
                      {channels.map(channel => (
                        <option
                          key={channel.id}
                          value={channel.id}
                        >
                          {channel.category ? `${channel.category} > ` : ''}#{channel.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>

                <button
                  onClick={handlePostToChannel}
                  disabled={isPosting || hasPosted || !selectedChannel}
                >
                  {hasPosted
                    ? '✅ Posted to Channel'
                    : isPosting
                      ? 'Posting to Discord...'
                      : '💬 Post Directly to Channel'}
                </button>
              </div>
            )}

            <button
              id="btn-restart"
              disabled={!allPlayersReady}
              onClick={handleRestart}
            >
              {allPlayersReady ? 'Play Again' : `Waiting... (${readyCount}/${playersExcludingHost.length})`}
            </button>
          </div>
        ) : (
          <ReadyButton promptText={'Ready for New Game'} />
        )}
      </div>
    </div>
  );
};
