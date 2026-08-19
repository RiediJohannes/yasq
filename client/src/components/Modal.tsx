import { ComponentChildren, CSSProperties, TargetedMouseEvent } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { CrossIcon } from './Icons';

export interface BaseModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  width?: string;
  height?: string;
  children?: ComponentChildren;
}

type KnownCSSProperties = {
  [K in keyof CSSProperties as string extends K ? never : number extends K ? never : K]: CSSProperties[K];
};

export type ModalProps = BaseModalProps & KnownCSSProperties;

/**
 * Generic modal (dialog window) that accepts arbitrary HTML content.
 * The modal appears in front of the page content whenever isOpen evaluates to true.
 */
export const Modal = ({ isOpen, onClose, title, width, height, children, ...styleProps }: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Update modal state based on the isOpen condition
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Attach onClose event handlers on load
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      document.body.style.overflow = '';
      onCloseRef.current?.();
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  const closeDialog = (e: TargetedMouseEvent<HTMLDialogElement | HTMLButtonElement>) => {
    if (e.target === buttonRef.current || e.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  };

  // Merge user-defined styles with pre-defined CSS properties
  const modalStyle: CSSProperties = {
    '--width': width,
    '--height': height,
    ...styleProps,
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      style={modalStyle}
      onClick={closeDialog}
    >
      <div style="display: flex; flex-direction: column;">
        {/* Header */}
        {title && (
          <header className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              ref={buttonRef}
              type="button"
              className="modal-close-cross"
              onClick={closeDialog}
              aria-label="Close modal"
            >
              <CrossIcon className="modal-close-cross-icon" />
            </button>
          </header>
        )}

        {/* Body */}
        <div className="modal-inner">{children}</div>

        {!title && (
          <button
            ref={buttonRef}
            type="button"
            className="modal-close-btn"
            onClick={closeDialog}
            aria-label="Close modal"
          >
            Close
          </button>
        )}
      </div>
    </dialog>
  );
};
