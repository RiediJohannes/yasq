import { effect, signal } from "@preact/signals";

/** Holds the unique ID of whichever tooltip is currently open */
export const activeTooltipId = signal<string | null>(null);

effect(() => {
  if (!activeTooltipId.value) return;

  const closeAll = () => {
    activeTooltipId.value = null;
  };

  // Add various window listeners to automatically close all tooltips
  window.addEventListener("touchstart", closeAll);
  window.addEventListener("click", closeAll);
  window.addEventListener("scroll", closeAll, true);

  // Clean-up function
  return () => {
    window.removeEventListener("touchstart", closeAll);
    window.removeEventListener("click", closeAll);
    window.removeEventListener("scroll", closeAll, true);
  };
});

/** Measure the actual position and width of the current container */
export const measureBounds = (el: HTMLElement) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--trigger-x", `${rect.left}px`);

  const computedStyle = window.getComputedStyle(el, "::after");
  el.style.setProperty("--tooltip-width", computedStyle.width);
};