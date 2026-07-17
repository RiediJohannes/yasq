import { effect, signal } from "@preact/signals";

const activeTooltipId = signal<string | null>(null);

effect(() => {
  const currentId = activeTooltipId.value;
  if (!currentId) return;

  const closeAll = () => {
    activeTooltipId.value = null;
  };

  window.addEventListener("touchstart", closeAll);
  window.addEventListener("click", closeAll);
  window.addEventListener("scroll", closeAll, true);

  return () => {
    window.removeEventListener("touchstart", closeAll);
    window.removeEventListener("click", closeAll);
    window.removeEventListener("scroll", closeAll, true);
  };
});

export const useExclusiveTooltip = () => {
  return {
    activeTooltipId: activeTooltipId.value,
    setActiveTooltipId: (id: string | null) => {
      activeTooltipId.value = id;
    }
  };
};