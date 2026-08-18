import { expect as baseExpect, type Locator } from '@playwright/test';

export const expect = baseExpect.extend({
  toHaveTooltip,
  toHaveActiveTooltip,
  toKeepTooltipWithinViewportBounds: toBeWithinViewportBounds,
  toHaveCenteredTooltipArrow,
});

async function toHaveTooltip(locator: Locator, tooltipText?: string) {
  const assertionName = 'toHaveTooltip';
  const expected = !this.isNot;

  // Static assertion (DOM structure), so no polling needed here
  const actual = await hasTooltip(locator);
  let pass = actual === expected;

  let actualText: string | null = null;
  if (pass && tooltipText !== undefined && !this.isNot) {
    actualText = await locator.getAttribute('data-tooltip');
    pass = actualText === tooltipText;
  }

  if (this.isNot) pass = !pass;

  return {
    pass,
    name: assertionName,
    message: () => {
      const hint = this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot });

      if (tooltipText !== undefined && actualText !== null) {
        return (
          `${hint}\n\n` +
          `Locator: ${locator}\n` +
          `Expected tooltip text: ${this.utils.printExpected(tooltipText)}\n` +
          `Received: ${this.utils.printReceived(actualText)}`
        );
      }

      return (
        `${hint}\n\n` +
        `Locator: ${locator}\n` +
        `Expected tooltip presence: ${this.utils.printExpected(expected)}\n` +
        `Received: ${this.utils.printReceived(actual)}`
      );
    },
  };
}

async function hasTooltip(locator: Locator): Promise<boolean> {
  return await locator.evaluate(el => {
    const markerClassIsPresent = el.classList.contains('has-tooltip');
    const style = window.getComputedStyle(el, '::after');
    return markerClassIsPresent && style.content !== 'none';
  });
}

async function toHaveActiveTooltip(locator: Locator, options?: { timeout?: number }) {
  const assertionName = 'toHaveActiveTooltip';

  const elementHasTooltip = await hasTooltip(locator);
  if (!elementHasTooltip) {
    return {
      pass: false,
      name: assertionName,
      message: () =>
        this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot }) +
        '\n\nElement passed to toHaveActiveTooltip does not have a tooltip at all!',
    };
  }

  let pass: boolean;
  let matcherResult: any;

  try {
    const poller = baseExpect.poll(() => isTooltipActive(locator), { timeout: options?.timeout });
    await poller.toBe(!this.isNot);
    pass = true;
  } catch (e: any) {
    matcherResult = e.matcherResult;
    pass = false;
  }

  if (this.isNot) pass = !pass;

  return {
    pass,
    name: assertionName,
    message: () =>
      this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot }) +
      '\n\n' +
      `Locator: ${locator}\n` +
      `Expected active state: ${!this.isNot}\n` +
      (matcherResult ? `Received: ${this.utils.printReceived(matcherResult.actual)}` : ''),
  };
}

async function isTooltipActive(locator: Locator): Promise<boolean> {
  return await locator.evaluate(el => {
    const cssClassIsPresent = el.classList.contains('show-tooltip');
    const style = window.getComputedStyle(el, '::after');
    return cssClassIsPresent && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
}

async function toBeWithinViewportBounds(locator: Locator, options?: { timeout?: number }) {
  const assertionName = 'toBeWithinViewportBounds';
  let pass: boolean;
  let matcherResult: any;
  let lastResult: BoundsCheckResult | null = null;

  try {
    const poller = baseExpect.poll(
      async () => {
        lastResult = await isWithinViewportBounds(locator);
        return lastResult?.withinBounds ?? false;
      },
      { timeout: options?.timeout }
    );

    await poller.toBe(!this.isNot);
    pass = true;
  } catch (e: any) {
    matcherResult = e.matcherResult;
    pass = false;
  }

  if (this.isNot) pass = !pass;

  return {
    pass,
    name: assertionName,
    message: () => {
      const hint = this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot });

      if (lastResult === null) {
        return `${hint}\n\nElement's ::after tooltip pseudo-element is currently not visible.`;
      }

      const overflowLines = lastResult
        ? Object.entries(lastResult.overflow)
            .filter(([, px]) => px > 0)
            .map(([edge, px]) => `  - ${edge}: overflowing by ${px.toFixed(2)}px`)
            .join('\n')
        : '';

      return (
        `${hint}\n\n` +
        `Locator: ${locator}\n` +
        `Expected: tooltip fully within viewport (tolerance ${ENFORCED_AIR_GAP_PX}px)\n` +
        (overflowLines ? `Overflowing edges:\n${overflowLines}\n` : '') +
        (matcherResult ? `Received: ${this.utils.printReceived(matcherResult.actual)}` : '')
      );
    },
  };
}

const ENFORCED_AIR_GAP_PX = 5;

interface BoundsCheckResult {
  withinBounds: boolean;
  overflow: { top: number; right: number; bottom: number; left: number };
  rect: { top: number; right: number; bottom: number; left: number };
}

async function isWithinViewportBounds(locator: Locator): Promise<BoundsCheckResult | null> {
  return await locator.evaluate((el, gap) => {
    const style = window.getComputedStyle(el, '::after');

    // Pseudo-element is not rendered at all
    if (style.content === 'none' || style.display === 'none') {
      return null;
    }

    const hostRect = el.getBoundingClientRect();
    const width = parseFloat(style.width) || 0;
    const height = parseFloat(style.height) || 0;

    // Construct rectangle with dimensions of ::after element
    const left =
      style.left !== 'auto'
        ? hostRect.left + parseFloat(style.left)
        : style.right !== 'auto'
          ? hostRect.right - parseFloat(style.right) - width
          : hostRect.left;

    const top =
      style.top !== 'auto'
        ? hostRect.top + parseFloat(style.top)
        : style.bottom !== 'auto'
          ? hostRect.bottom - parseFloat(style.bottom) - height
          : hostRect.top;

    const rect = { top, left, right: left + width, bottom: top + height };

    const overflow = {
      top: -Math.min(0, rect.top - gap),
      left: -Math.min(0, rect.left - gap),
      right: Math.max(0, rect.right + gap - window.innerWidth),
      bottom: Math.max(0, rect.bottom + gap - window.innerHeight),
    };

    const withinBounds = overflow.top === 0 && overflow.left === 0 && overflow.right === 0 && overflow.bottom === 0;

    return { withinBounds, overflow, rect };
  }, ENFORCED_AIR_GAP_PX);
}

const ARROW_CENTER_TOLERANCE_PX = 2;

interface ArrowCenterCheckResult {
  centered: boolean;
  arrowCenterX: number;
  hostCenterX: number;
}

async function toHaveCenteredTooltipArrow(locator: Locator, options?: { timeout?: number }) {
  const assertionName = 'toHaveCenteredTooltipArrow';
  let pass: boolean;
  let matcherResult: any;
  let lastResult: ArrowCenterCheckResult | null = null;

  try {
    const poller = baseExpect.poll(
      async () => {
        lastResult = await isArrowCentered(locator);
        return lastResult?.centered ?? false;
      },
      { timeout: options?.timeout }
    );

    await poller.toBe(!this.isNot);
    pass = true;
  } catch (e: any) {
    matcherResult = e.matcherResult;
    pass = false;
  }

  if (this.isNot) pass = !pass;

  return {
    pass,
    name: assertionName,
    message: () => {
      const hint = this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot });

      if (lastResult === null) {
        return `${hint}\n\nElement's ::before tooltip arrow is currently not visible.`;
      }

      return (
        `${hint}\n\n` +
        `Locator: ${locator}\n` +
        `Expected: arrow horizontally centered on trigger (tolerance ${ARROW_CENTER_TOLERANCE_PX}px)\n` +
        `Arrow center X: ${lastResult.arrowCenterX.toFixed(2)}\n` +
        `Host center X:  ${lastResult.hostCenterX.toFixed(2)}\n` +
        (matcherResult ? `Received: ${this.utils.printReceived(matcherResult.actual)}` : '')
      );
    },
  };
}

async function isArrowCentered(locator: Locator): Promise<ArrowCenterCheckResult | null> {
  return await locator.evaluate((el, tolerance) => {
    const style = window.getComputedStyle(el, '::before');

    // Arrow pseudo-element is not rendered at all
    if (style.content === 'none' || style.display === 'none') {
      return null;
    }

    const hostRect = el.getBoundingClientRect();
    const width = parseFloat(style.width) || 0;

    const left =
      style.left !== 'auto'
        ? hostRect.left + parseFloat(style.left)
        : style.right !== 'auto'
          ? hostRect.right - parseFloat(style.right) - width
          : hostRect.left;

    const arrowCenterX = left + width / 2;
    const hostCenterX = hostRect.left + hostRect.width / 2;

    return {
      centered: Math.abs(hostCenterX - arrowCenterX) <= tolerance,
      arrowCenterX,
      hostCenterX,
    };
  }, ARROW_CENTER_TOLERANCE_PX);
}
