import { Signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const TagFilterDropdown = ({
  availableTags,
  selectedTags,
  reachableTags
}: {
  availableTags: Record<string, string[]>,
  selectedTags: Signal<Record<string, string[]>>,
  reachableTags: Map<string, number>
}) => {
  const isOpen = useSignal(false);

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

  const toggleTag = (type: string, value: string) => {
    const current = { ...selectedTags.value };
    const typeFilters = current[type] || [];

    if (typeFilters.includes(value)) {
      current[type] = typeFilters.filter(v => v !== value);
    } else {
      current[type] = [...typeFilters, value];
    }
    selectedTags.value = current;
  };

  const activeCount = Object.values(selectedTags.value).flat().length;

  const clearAll = (e: MouseEvent) => {
    e.stopPropagation();
    selectedTags.value = {};
  };

  const closeMenuAndFocusTrigger = (currentTarget: HTMLElement) => {
    isOpen.value = false;
    // Walk up the DOM tree to find the local dropdown container's trigger button
    const container = currentTarget.closest(".filter-dropdown");
    (container?.querySelector(".dropdown-trigger") as HTMLElement)?.focus();
  };

  return (
    <div className="filter-dropdown">
      <div className="dropdown-trigger-wrapper">
        <button
          className={`dropdown-trigger ${activeCount > 0 ? 'active' : ''}`}
          onClick={() => (isOpen.value = !isOpen.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === " " || e.key === "Enter") {
              e.preventDefault();
              isOpen.value = true;
              // Move focus to the first item immediately after rendering
              setTimeout(() => {
                const firstItem = document.querySelector(".dropdown-menu .dropdown-item:not(.disabled)") as HTMLElement;
                firstItem?.focus();
              }, 0);
            }
          }}
        >
          {activeCount > 0 ? `Filters (${activeCount})` : 'Filter by Tags'}
          <span className={`arrow ${isOpen.value ? 'up' : 'down'}`}>▼</span>
        </button>

        {activeCount > 0 && (
          <button
            onClick={clearAll}
            title="Clear all filters"
          >
            ✕
          </button>
        )}
      </div>

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
              {Object.entries(availableTags).map(([type, values]) => (
                <div key={type} className="dropdown-group">
                  <div className="group-header">{type}</div>
                  {values.sort().map(val => {
                    const isSelected = selectedTags.value[type]?.includes(val);
                    const count = reachableTags.get(val) || 0;
                    const isDisabled = !isSelected && !reachableTags.has(val);

                    return (
                      <label
                        key={val}
                        className={`dropdown-item ${isDisabled ? 'disabled' : ''}`}
                        onKeyDown={(e) => {
                          const target = e.currentTarget;

                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleTag(type, val);
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            const enabledItems = Array.from(
                              document.querySelectorAll(".dropdown-menu .dropdown-item:not(.disabled)")
                            ) as HTMLElement[];
                            const currentIndex = enabledItems.indexOf(target);
                            if (currentIndex > -1 && currentIndex < enabledItems.length - 1) {
                              enabledItems[currentIndex + 1].focus();
                            }
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            const enabledItems = Array.from(
                              document.querySelectorAll(".dropdown-menu .dropdown-item:not(.disabled)")
                            ) as HTMLElement[];
                            const currentIndex = enabledItems.indexOf(target);
                            if (currentIndex > 0) {
                              enabledItems[currentIndex - 1].focus();
                            } else {
                              closeMenuAndFocusTrigger(target);
                            }
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            isOpen.value = false;
                            closeMenuAndFocusTrigger(target);
                          }
                        }}
                      >
                        <div className="item-label-group">
                          <input
                            type="checkbox"
                            disabled={isDisabled}
                            checked={isSelected || false}
                            onChange={() => toggleTag(type, val)}
                          />
                          <span style={{ opacity: isDisabled ? 0.5 : 1 }}>{val}</span>
                        </div>
                        <span className="tag-count">{count}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};