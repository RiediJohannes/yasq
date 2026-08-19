import { ComponentChildren, CSSProperties, TargetedKeyboardEvent, TargetedMouseEvent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CrossIcon } from './Icons';
import { CommonCSSProperties } from '../utils/types';
import { isTouchDevice } from '../utils/helper';

export interface BaseModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  width?: string;
  height?: string;
  forceBigCloseButton?: boolean;
  children?: ComponentChildren;
}

export type ModalProps = BaseModalProps & CommonCSSProperties;

/**
 * Generic modal (dialog window) that accepts arbitrary HTML content.
 * The modal appears in front of the page content whenever isOpen evaluates to true.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  width,
  height,
  forceBigCloseButton = false,
  children,
  ...styleProps
}: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Update modal state based on the isOpen condition
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden'; // prevent scrolling in the background

    return () => (document.body.style.overflow = ''); // always restore scrolling on clean-up
  }, [isOpen]);

  // Attach onClose event handler on load
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onCloseRef.current?.();

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose); // cleanup
  }, []);

  const handleKeyDown = (e: TargetedKeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && document.activeElement === dialogRef.current) {
      e.preventDefault();
      closeButtonRef.current?.focus();
    }
  };

  const closeDialog = (e: TargetedMouseEvent<HTMLDialogElement | HTMLButtonElement>) => {
    if (e.target === closeButtonRef.current || e.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  };

  // Apply user-defined CSS styles, handle width and height separately
  const modalStyle: CSSProperties = {
    ...(width !== undefined && { '--width': width }),
    ...(height !== undefined && { '--height': height }),
    ...styleProps,
  };

  const hasBigCloseButton = forceBigCloseButton || !title || isTouchDevice();

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      style={modalStyle}
      onClick={closeDialog}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      autoFocus
    >
      {/* Header */}
      {title && (
        <header className={`modal-header ${!hasBigCloseButton ? 'has-close-btn' : ''}`}>
          <h2 className="modal-title">{title}</h2>
          {!hasBigCloseButton && (
            <button
              ref={closeButtonRef}
              type="button"
              className="modal-close-cross"
              onClick={closeDialog}
              aria-label="Close modal"
            >
              <CrossIcon className="modal-close-cross-icon" />
            </button>
          )}
        </header>
      )}

      {/* Body */}
      <div className="modal-inner">{children}</div>

      {/* Big close button at the bottom */}
      {hasBigCloseButton && (
        <button
          ref={closeButtonRef}
          type="button"
          className="modal-close-btn"
          onClick={closeDialog}
          aria-label="Close modal"
        >
          Close
        </button>
      )}
    </dialog>
  );
};
