import { useRef, useState } from 'preact/hooks';

export function useRovingTabIndex(itemCount: number) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent, index: number, isHorizontal = true) => {
    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';

    let nextIndex: number;
    if (e.key === nextKey) {
      e.preventDefault();
      nextIndex = (index + 1) % itemCount;
    } else if (e.key === prevKey) {
      e.preventDefault();
      nextIndex = (index - 1 + itemCount) % itemCount;
    } else {
      return;
    }

    setFocusedIndex(nextIndex);
    refs.current[nextIndex]?.focus();
  };

  return {
    focusedIndex,
    setFocusedIndex,
    getTabProps: (index: number) => ({
      elementRef: (el: HTMLElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: index === focusedIndex ? 0 : -1,
      onFocus: () => setFocusedIndex(index),
    }),
    handleKeyDown,
  };
}
