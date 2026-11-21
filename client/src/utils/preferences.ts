import { effect, signal } from '@preact/signals';
import { parseLiteral } from './helper';

/**
 * Declares a Preact signal, whose initial value is read from localStorage by the given key, and automatically
 * updates localStorage when the signal's value changes.
 */
function persistedSignal<T extends string | number | boolean>(key: string, defaultValue: T) {
  const persistedValue = parseLiteral<T>(localStorage.getItem(key), defaultValue);

  const signalVar = signal<T>(persistedValue);
  // Continually update localStorage on updates of the signal
  effect(() => {
    localStorage.setItem(key, String(signalVar.value));
  });

  return signalVar;
}

export const showKeyboardHints = persistedSignal<boolean>('app-show-hints', true);
export const alwaysShowScoreDetails = persistedSignal<boolean>('app-show-score-details', false);
export const defaultReadyState = persistedSignal<boolean>('app-default-ready-state', false);

effect(() => {
  // Set the document's data-keyboard-hints attribute on updates of the signal
  document.documentElement.dataset.keyboardHints = String(showKeyboardHints.value);
});
