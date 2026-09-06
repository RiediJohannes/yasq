import { useState } from 'preact/hooks';
import { discordSdk, gameState, isMac, useAuth } from '../main';
import * as backend from '../utils/backend';
import { getActionKeyLabel, getUserId } from '../utils/helper';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

// Custom hook to inform the backend about the user's ready status
export const useReadyButtonLogic = () => {
  const auth = useAuth();
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(
      auth.access_token,
      discordSdk.instanceId,
      !gameState.value.readyUsers.includes(getUserId(auth)!)
    );
  };

  return { hasInteracted, handleReady };
};

interface ReadyButtonProps {
  isHost?: boolean;
  promptText?: string;
}

export const ReadyButton = ({ promptText }: ReadyButtonProps) => {
  const auth = useAuth();
  const { hasInteracted, handleReady } = useReadyButtonLogic();

  const userId = getUserId(auth)!;
  const isReady = gameState.value.readyUsers.includes(userId);
  const isFinalRound = gameState.value.currentRound >= gameState.value.gameSettings.rounds;

  useKeyboardShortcut({ key: 'R', altKey: !isMac, metaKey: isMac }, () => {
    void handleReady();
  });

  return (
    <div className="shortcut-badge-btn-wrapper">
      <button
        id="btn-ready"
        className={`ready-btn ${isReady ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
        onClick={handleReady}
      >
        {isReady
          ? "I'm Ready! ✅"
          : promptText
            ? promptText
            : isFinalRound
              ? 'Ready for Final Results'
              : 'Ready for Next Round'}
      </button>
      <span className="shortcut-badge">
        <kbd>{getActionKeyLabel(isMac)}</kbd>+<kbd>R</kbd>
      </span>
    </div>
  );
};
