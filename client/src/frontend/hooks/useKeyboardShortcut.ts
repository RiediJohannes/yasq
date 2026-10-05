import { useEffect, useRef } from 'preact/hooks';

type KeyCombo = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

export const useKeyboardShortcut = (shortcut: KeyCombo, callback: (e: KeyboardEvent) => void) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const targetKey = shortcut.key.toLowerCase();
  const reqCtrl = !!shortcut.ctrlKey;
  const reqAlt = !!shortcut.altKey;
  const reqShift = !!shortcut.shiftKey;
  const reqMeta = !!shortcut.metaKey;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchKey = event.key.toLowerCase() === targetKey;
      const matchCtrl = event.ctrlKey === reqCtrl;
      const matchAlt = event.altKey === reqAlt;
      const matchShift = event.shiftKey === reqShift;
      const matchMeta = event.metaKey === reqMeta;

      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Allow typing if any modifier is held down
      if (isTyping && !event.ctrlKey && !event.altKey && !event.metaKey) {
        return;
      }

      if (matchKey && matchCtrl && matchAlt && matchShift && matchMeta) {
        event.preventDefault();
        event.stopPropagation();
        callbackRef.current(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [targetKey, reqCtrl, reqAlt, reqShift, reqMeta]);
};
