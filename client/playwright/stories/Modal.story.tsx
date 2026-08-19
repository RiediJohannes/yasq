import { useState } from 'preact/hooks';
import { Modal } from '../../src/components/Modal';

interface BasicModalProps {
  startOpen: boolean;
  hasBigCloseButton?: boolean;
  title?: string | null;
}

const Basic = ({ startOpen, hasBigCloseButton, title = 'Custom Title' }: BasicModalProps) => {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [closeCount, setCloseCount] = useState<number>(0);

  const handleClose = () => {
    setIsOpen(false);
    setCloseCount(current => current + 1);
  };

  return (
    <div
      id="direct-parent"
      style={{ width: '100vw', height: '100vh' }}
    >
      <button
        id="open-btn"
        onClick={() => setIsOpen(true)}
      >
        Open Modal
      </button>

      <Modal
        isOpen={isOpen}
        title={title ?? undefined}
        onClose={handleClose}
        forceBigCloseButton={hasBigCloseButton}
      >
        <div id="modal-content">
          <button
            id="inner-btn"
            onClick={handleClose}
          >
            Modal Content
          </button>
        </div>
      </Modal>

      <span id="close-count">{closeCount}</span>
    </div>
  );
};

export const BasicClosed = () => Basic({ startOpen: false });
export const BasicOpen = () => Basic({ startOpen: true });

export const BigCloseButtonClosed = () => Basic({ startOpen: false, hasBigCloseButton: true });
export const BigCloseButtonOpen = () => Basic({ startOpen: true, hasBigCloseButton: true });

export const NoTitleOpen = () => Basic({ startOpen: true, title: null });
