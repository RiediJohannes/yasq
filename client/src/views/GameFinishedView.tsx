import { useSignal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

import * as backend from "../utils/backend";
import { auth, discordSdk, gameState, isMac, participants } from "../main";
import { findUser, getActionKeyLabel, getUserId } from "../utils/helper";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { getAvatarUrl, getDisplayName } from "@yasq/shared";
import { RoundBubblesGroup } from "../components/RoundBubble";
import { DiscordAvatar } from "../components/DiscordAvatar";

export const FinalResultsView = ({ isHost }: { isHost: boolean }) => {
  const leaderboard = useSignal<any[]>([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [hasPosted, setHasPosted] = useState(false);
  const [channels, setChannels] = useState<{id: string, name: string, category: string}[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');

  useEffect(() => {
    backend.getFinalResults(discordSdk.instanceId).then((data) => {
      leaderboard.value = data.leaderboard;
    });
  }, []);

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(
      auth.value.access_token,
      discordSdk.instanceId,
      !gameState.value.readyUsers.includes(getUserId(auth.value))
    );
  };

  const handleDownload = () => {
    setIsDownloading(true);
    backend.downloadResultsImage(discordSdk.instanceId, discordSdk);
    setIsDownloading(false);
  };

  const handlePostToChannel = async () => {
    setIsPosting(true);
    try {
      const response = await backend.postResultsToDiscordChannel(
        auth.value.access_token,
        discordSdk.instanceId,
        selectedChannel
      );

      if (response.ok) {
        setHasPosted(true);
      } else {
        console.error("Failed to post results package.");
      }
    } catch (error) {
      console.error("Error running post routine:", error);
    } finally {
      setIsPosting(false);
    }
  };

  useEffect(() => {
    if (!isHost) return;

    backend.getChannels(
      auth.value.access_token,
      discordSdk.instanceId,
      discordSdk.guildId!
    ).then(data => setChannels(data));
  }, [isHost]);

  useKeyboardShortcut({ key: "R", altKey: !isMac, metaKey: isMac }, () => {
    if (!isHost) handleReady();
  });

  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyCount = gameState.value.readyUsers.length;
  const allPlayersReady = playersExcludingHost.length > 0 &&
                          playersExcludingHost.every(p => gameState.value.readyUsers.includes(p.id));

  const handleRestart = async (e: MouseEvent) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    await backend.restartGame(auth.value.access_token, discordSdk.instanceId);
  };

  return (
    <div className="final-leaderboard centered">
      <h1 className="results-title">🏆 Final Results</h1>

      <div className="leaderboard-container">
        {leaderboard.value.map((player, index) => {
          const user = findUser(participants.value, player.userId);

          const total = leaderboard.value.length;
          const staggerIndex = (total - 1) - index;
          const delay = staggerIndex * 1.5;
          const isWinner = index === 0;

          return (
            <div
              key={player.userId}
              className="player-wrapper"
              style={{ animationDelay: `${delay}s` }}
            >
              <div
                className={`player-card ${isWinner ? 'winner' : ''}`}
                style={{ animationDelay: `${delay + 0.4}s`, zIndex: (1000 - index) }}
              >
                {isWinner && <div className="shimmer-layer" />}
                <div className="player-main-info">
                  <div className="rank">#{index + 1}</div>
                  <DiscordAvatar src={getAvatarUrl(user)} userName={getDisplayName(user)} />
                  <div className="name">{isWinner ? '👑 ' : ''}{getDisplayName(user)}</div>
                  <div className="total-score">{player.totalScore} pts</div>
                </div>

                <div className="history-grid">
                  <div className="history-label">Round Breakdown:</div>
                  <RoundBubblesGroup
                    rounds={player.roundHistory}
                    userId={player.userId}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isHost ? (
        <div>
          <div className='export-section'>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : '📥 Download Results Image'}
            </button>

            <select
              value={selectedChannel}
              disabled={channels.length === 0 || isPosting || hasPosted}
              onChange={(e) => {
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
                    <option key={channel.id} value={channel.id}>
                      {channel.category ? `${channel.category} > ` : ""}#{channel.name}
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
                : (isPosting ? 'Posting to Discord...' : '💬 Post Directly to Channel')}
            </button>
          </div>

          <button
            id="btn-restart"
            disabled={!allPlayersReady}
            onClick={handleRestart}
          >
            {allPlayersReady
              ? "Play Again"
              : `Waiting... (${readyCount}/${playersExcludingHost.length})`}
          </button>
        </div>
      ) : (
        <div className='shortcut-badge-btn-wrapper'>
          <button
            className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
            id="btn-ready"
            onClick={handleReady}
          >
            {gameState.value.readyUsers.includes(getUserId(auth.value)) ? "I'm Ready! ✅" : "Ready for New Game"}
          </button>
          <span className="shortcut-badge">
            <kbd>{getActionKeyLabel(isMac)}</kbd>+<kbd>R</kbd>
          </span>
        </div>
      )}
    </div>
  );
};