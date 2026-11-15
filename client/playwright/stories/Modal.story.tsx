import { useState } from 'preact/hooks';
import { Modal } from '@components/Modal';
import { useSignal } from '@preact/signals';

interface GeneralModalProps {
  startOpen: boolean;
  hasBigCloseButton?: boolean;
  title?: string | null;
}

const GeneralModal = ({ startOpen, hasBigCloseButton, title = 'Custom Title' }: GeneralModalProps) => {
  const isOpen = useSignal<boolean>(startOpen);
  const [closeCount, setCloseCount] = useState<number>(0);

  const handleClose = () => {
    isOpen.value = false;
    setCloseCount(current => current + 1);
  };

  return (
    <div
      id="direct-parent"
      style={{ width: '100vw', height: '100vh' }}
    >
      <button
        id="open-btn"
        onClick={() => (isOpen.value = true)}
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

export const BasicClosed = () => GeneralModal({ startOpen: false });
export const BasicOpen = () => GeneralModal({ startOpen: true });

export const BigCloseButtonClosed = () => GeneralModal({ startOpen: false, hasBigCloseButton: true });
export const BigCloseButtonOpen = () => GeneralModal({ startOpen: true, hasBigCloseButton: true });

export const NoTitleOpen = () => GeneralModal({ startOpen: true, title: null });
