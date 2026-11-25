import { effect, signal } from '@preact/signals';
import { ComponentChildren } from 'preact';

import { isMobileSize } from './helper';

/** Holds the unique ID of whichever tooltip is currently open */
export const activeTooltipId = signal<string | null>(null);

/** Holds the rich JSX content or plain string of the active tooltip */
export const activeTooltipContent = signal<ComponentChildren | null>(null);

export const closeActiveTooltip = () => {
  activeTooltipId.value = null;
  activeTooltipContent.value = null;
};

export enum Placement {
  ABOVE = 'above',
  BELOW = 'below',
}

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

/** Minimum distance (in px) between the tooltip and safe-area edges. */
const BOUNDARY_PADDING = 15;
/** Vertical offset between trigger and tooltip body (must match the CSS `--tooltip-gap` + arrow height). */
const VERTICAL_OFFSET = 16;

interface SafeArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const getSafeArea = (customBoundary?: HTMLElement | null): SafeArea => {
  // Take the client viewport as the fallback boundary if no custom boundary is provided
  let left = BOUNDARY_PADDING;
  let right = window.innerWidth - BOUNDARY_PADDING;
  let top = BOUNDARY_PADDING;
  let bottom = window.innerHeight - BOUNDARY_PADDING;

  if (customBoundary?.isConnected) {
    const customRect = customBoundary.getBoundingClientRect();
    const customLeft = customRect.left + customBoundary.clientLeft;
    const customTop = customRect.top + customBoundary.clientTop;
    const customRight = customLeft + customBoundary.clientWidth;
    const customBottom = customTop + customBoundary.clientHeight;

    left = Math.max(left, customLeft + BOUNDARY_PADDING);
    right = Math.min(right, customRight - BOUNDARY_PADDING);
    top = Math.max(top, customTop + BOUNDARY_PADDING);
    bottom = Math.min(bottom, customBottom - BOUNDARY_PADDING);
  }

  return { left, right, top, bottom };
};

const computeHorizontalShift = (tooltipRect: DOMRect, triggerRect: DOMRect, safeArea: SafeArea): number => {
  const triggerCenter = triggerRect.left + triggerRect.width / 2;
  const minShift = safeArea.left - (triggerCenter - tooltipRect.width / 2);
  const maxShift = safeArea.right - (triggerCenter + tooltipRect.width / 2);

  return Math.max(minShift, Math.min(0, maxShift));
};

const checkVerticalPlacement = (
  tooltipRect: DOMRect,
  triggerRect: DOMRect,
  safeArea: SafeArea,
  requestedPlacement: Placement
): Placement => {
  const requiredHeight = tooltipRect.height + VERTICAL_OFFSET;
  const fitsAbove = triggerRect.top - requiredHeight >= safeArea.top;
  const fitsBelow = triggerRect.bottom + requiredHeight <= safeArea.bottom;

  const fitsRequested = requestedPlacement === Placement.ABOVE ? fitsAbove : fitsBelow;
  if (fitsRequested) {
    return requestedPlacement;
  }

  const fitsOpposite = requestedPlacement === Placement.ABOVE ? fitsBelow : fitsAbove;
  if (fitsOpposite) {
    return requestedPlacement === Placement.ABOVE ? Placement.BELOW : Placement.ABOVE;
  }

  // Choose placement with smaller violation
  const spaceAbove = triggerRect.top - safeArea.top;
  const spaceBelow = safeArea.bottom - triggerRect.bottom;
  return spaceAbove >= spaceBelow ? Placement.ABOVE : Placement.BELOW;
};

export const adjustTooltipPlacement = (
  targetElement: HTMLElement,
  tooltipId: string,
  requestedPlacement: Placement,
  boundary?: HTMLElement | null,
  maxWidthPx: number = Number.POSITIVE_INFINITY
) => {
  if (!targetElement) return;

  const triggerRect = targetElement.getBoundingClientRect();

  requestAnimationFrame(() => {
    const tooltipEl = document.getElementById(tooltipId) as HTMLElement | null;
    if (!tooltipEl) return;

    const safeArea = getSafeArea(boundary);
    const maxSafeWidth = Math.max(0, safeArea.right - safeArea.left);
    const isMobile = isMobileSize();

    // Take the custom maxWidthPx if it fits within the safe area and we are on desktop, otherwise use the maxSafeWidth
    const imposedMaxWidth =
      !isMobile && Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? Math.min(maxWidthPx, maxSafeWidth) : maxSafeWidth;

    tooltipEl.style.maxWidth = `${imposedMaxWidth}px`;
    const tooltipRect = tooltipEl.getBoundingClientRect();

    const horizontalShift = computeHorizontalShift(tooltipRect, triggerRect, safeArea);
    targetElement.style.setProperty('--tooltip-shift', `${horizontalShift}px`);

    // Overwrite the placement (above/below) if the tooltip would not fit otherwise
    const finalPlacement = checkVerticalPlacement(tooltipRect, triggerRect, safeArea, requestedPlacement);
    tooltipEl.setAttribute('data-placement', finalPlacement);
  });
};
