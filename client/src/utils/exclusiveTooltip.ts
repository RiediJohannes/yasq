import { effect, signal } from '@preact/signals';
import { ComponentChildren } from 'preact';

/** Holds the unique ID of whichever tooltip is currently open */
export const activeTooltipId = signal<string | null>(null);

/** Holds the rich JSX content or plain string of the active tooltip */
export const activeTooltipContent = signal<ComponentChildren | null>(null);

export const closeActiveTooltip = () => {
  activeTooltipId.value = null;
  activeTooltipContent.value = null;
};

effect(() => {
  if (!activeTooltipId.value) {
    activeTooltipContent.value = null;
    return;
  }

  // Add various window listeners to automatically close all tooltips
  window.addEventListener('touchstart', closeActiveTooltip);
  window.addEventListener('click', closeActiveTooltip);
  window.addEventListener('scroll', closeActiveTooltip, true);
  // Listen for the Escape key to close the tooltip as per MDN guidelines
  window.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (activeTooltipId.value === null) return;

      // Close tooltips and consume Escape keyboard event
      closeActiveTooltip();
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // Clean-up function
  return () => {
    window.removeEventListener('touchstart', closeActiveTooltip);
    window.removeEventListener('click', closeActiveTooltip);
    window.removeEventListener('scroll', closeActiveTooltip, true);
  };
});

/** Measure the actual position and width of the current container */
export const measureBounds = (el: HTMLElement) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--trigger-x', `${rect.left}px`);

  // Wait for the next animation frame so the tooltip DOM node is rendered before measuring width
  requestAnimationFrame(() => {
    const tooltipEl = el.querySelector('.tooltip-content') as HTMLElement;
    if (!tooltipEl) return;

    const tooltipWidth = tooltipEl.getBoundingClientRect().width;
    const triggerCenter = rect.left + rect.width / 2;
    const screenMargin = 15;

    let shift = 0;
    if (triggerCenter + tooltipWidth / 2 > window.innerWidth - screenMargin) {
      shift = window.innerWidth - screenMargin - (triggerCenter + tooltipWidth / 2);
    } else if (triggerCenter - tooltipWidth / 2 < screenMargin) {
      shift = screenMargin - (triggerCenter - tooltipWidth / 2);
    }

    el.style.setProperty('--tooltip-shift', `${shift}px`);
  });
};
