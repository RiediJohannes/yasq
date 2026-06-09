import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const SimpleDropdown = ({
  options,
  value,
  onChange
}: {
  options: string[],
  value: string,
  onChange: (val: string) => void
}) => {
  const isOpen = useSignal(false);
  const isFiltering = value !== options[0];
  const longestOption = options.reduce((a, b) => (a.length > b.length ? a : b), "");

  useEffect(() => {
    if (!isOpen.value) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        isOpen.value = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen.value]);

  const closeMenuAndFocusTrigger = (currentTarget: HTMLElement) => {
    isOpen.value = false;
    // Walk up the DOM tree to find the local dropdown container's trigger button
    const container = currentTarget.closest(".filter-dropdown");
    (container?.querySelector(".dropdown-trigger") as HTMLElement)?.focus();
  };

  return (
    <div
      className="filter-dropdown"
      style={{ "--longest-text": `"${longestOption}"` }}
    >
      <button
        className={`dropdown-trigger ${isFiltering ? 'active' : ''}`}
        onClick={() => (isOpen.value = !isOpen.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " " || e.key === "Enter") {
            e.preventDefault();
            isOpen.value = true;
            // Move focus to the first item immediately after rendering
            setTimeout(() => {
              const firstItem = document.querySelector(".dropdown-menu .dropdown-item") as HTMLElement;
              firstItem?.focus();
            }, 0);
          }
        }}
      >
        <span className="current-value">{value}</span>
        <span className={`arrow ${isOpen.value ? 'up' : 'down'}`}>▼</span>
      </button>

      {isOpen.value && (
        <>
          <div className="dropdown-overlay" onClick={() => (isOpen.value = false)} />
          <div
            className="dropdown-menu"
            onWheel={(e) => {
              const container = e.currentTarget.querySelector(".scrollbar-container") as HTMLElement;
              if (!container) return;

              const atTop = container.scrollTop === 0;
              const atBottom = container.scrollHeight - container.scrollTop === container.clientHeight;

              // If the wheel movement goes up at the top, or down at the bottom, stop it
              if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                e.preventDefault();
              }
            }}
          >
            <div className="scrollbar-container">
              {options.map(opt => {
                const selectOption = (currentTarget: HTMLElement) => {
                  onChange(opt);
                  closeMenuAndFocusTrigger(currentTarget);
                };

                return (
                  <div
                    key={opt}
                    className={`dropdown-item single-select ${value === opt ? 'active' : ''}`}
                    tabIndex={0} // Makes the item focusable via Tab or script
                    onClick={(e) => selectOption(e.currentTarget)}
                    onKeyDown={(e) => {
                      const target = e.currentTarget;

                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectOption(target);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        (target.nextElementSibling as HTMLElement)?.focus();
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (target.previousElementSibling) {
                          (target.previousElementSibling as HTMLElement)?.focus();
                        } else {
                          // Return focus back up to the button if at the top item
                          closeMenuAndFocusTrigger(target);
                        }
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        isOpen.value = false;
                        closeMenuAndFocusTrigger(target);
                      }
                    }}
                  >
                    {opt}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};