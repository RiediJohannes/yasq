import { useRef, useState } from 'preact/hooks';

export function useRovingTabIndex(itemCount: number) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  const activeIndex = Math.min(focusedIndex, Math.max(itemCount - 1, 0));

  const handleKeyDown = (e: KeyboardEvent, index: number, isHorizontal = true) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';

    let nextIndex: number;
    if (e.key === nextKey) {
      nextIndex = (index + 1) % itemCount;
    } else if (e.key === prevKey) {
      nextIndex = (index - 1 + itemCount) % itemCount;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = itemCount - 1;
    } else {
      return;
    }

    e.preventDefault();
    setFocusedIndex(nextIndex);
    refs.current[nextIndex]?.focus();
  };

  return {
    focusedIndex: activeIndex,
    setFocusedIndex,
    getTabProps: (index: number) => ({
      elementRef: (el: HTMLElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: index === activeIndex ? 0 : -1,
      onFocus: () => setFocusedIndex(index),
    }),
    handleKeyDown,
  };
}
