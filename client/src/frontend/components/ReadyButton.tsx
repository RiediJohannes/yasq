import { useState } from 'preact/hooks';
import { gameStatus, isMac, useBackend } from '@yasq/client/src/globals';
import { getActionKeyLabel } from '../../utils/helper';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

// Custom hook to inform the backend about the user's ready status
export const useReadyButtonLogic = () => {
  const backend = useBackend();
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(!gameStatus.value.readyPlayers.includes(backend.userId));
  };

  return { hasInteracted, handleReady };
};

interface ReadyButtonProps {
  isHost?: boolean;
  promptText?: string;
}

export const ReadyButton = ({ promptText }: ReadyButtonProps) => {
  const backend = useBackend();
  const { hasInteracted, handleReady } = useReadyButtonLogic();

  const isReady = gameStatus.value.readyPlayers.includes(backend.userId);
  const isFinalRound = gameStatus.value.state.round >= gameStatus.value.settings.rounds;

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
