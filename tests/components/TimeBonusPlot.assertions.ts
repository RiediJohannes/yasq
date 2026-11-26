import { expect as baseExpect } from '@playwright/test';

import {
  CURVE_ACCENT_COLOR,
  type ExpectedCurveData,
  type ExpectedGuess,
  PLOT_WIDTH,
  type TimeBonusPlotComponent,
  type TimeRange,
} from './TimeBonusPlot.object';

export const expect = baseExpect.extend({
  toHavePlayerTooltip,
  toHaveCurveTooltip,
  toHaveNoTooltip,
  toHaveMarkerFocused,
  toHaveHighlightedMarkerFor,
  toHaveTooltipAnchoredTo,
  toShowTimeRange,
  toBeFullyInViewport,
});

/** Asserts that the plot tooltip is currently visible and shows the correct guess data. */
async function assertPlotTooltip(plot: TimeBonusPlotComponent, guess: ExpectedGuess, options?: { timeout?: number }) {
  await baseExpect(plot.tooltip).toBeVisible(options);
  await baseExpect(plot.tooltipTitle).toHaveText(guess.name, options);
  await baseExpect(plot.tooltipMultiplier).toHaveText(guess.multiplierText, options);
  await baseExpect(plot.tooltipTime).toHaveText(`Time: ${guess.timeText}s`, options);
  baseExpect(await plot.getTooltipAccentColor()).toBe(guess.markerColor);
}

/** Asserts that exactly one marker is highlighted and that it matches the type of guess (colour, shape, chevron). */
async function assertHighlightedMarker(
  plot: TimeBonusPlotComponent,
  guess: ExpectedGuess,
  options?: { timeout?: number }
) {
  await baseExpect(plot.hoveredMarkers).toHaveCount(1, options);
  baseExpect(await plot.getHighlightedMarkerAppearance()).toEqual({
    color: guess.markerColor,
    isCurrent: guess.isCurrentPlayer,
    hasChevron: guess.isCurrentPlayer,
    shape: guess.multiplier === null ? 'cross' : 'circle',
  });
}

type MatcherContext = {
  isNot: boolean;
  utils: {
    matcherHint: (name: string, received?: string, expected?: string, options?: { isNot?: boolean }) => string;
  };
};

/** Helper function to run a custom assertion function with Playwright's retry logic and negation support. */
async function runMatcher(
  context: MatcherContext,
  assertionName: string,
  check: (options: { timeout?: number }) => Promise<void>,
  options?: { timeout?: number }
) {
  const capMs = context.isNot ? 50 : 250;
  const attemptOptions = { timeout: Math.min(options?.timeout ?? capMs, capMs) };

  // A negated assertion holds exactly when the positive check throws
  const attempt = context.isNot
    ? async () => {
        try {
          await check(attemptOptions);
        } catch {
          return; // positive condition (still) false -> negation holds for this attempt
        }
        throw new Error(`Expected ${assertionName} condition not to be met`);
      }
    : () => check(attemptOptions);

  let succeeded = false;
  let failureDetail = '';
  try {
    await baseExpect(attempt).toPass({ timeout: options?.timeout });
    succeeded = true;
  } catch (e: unknown) {
    failureDetail = e instanceof Error ? e.message : String(e);
  }

  const pass = context.isNot ? !succeeded : succeeded;
  return {
    pass,
    name: assertionName,
    message: () =>
      `${context.utils.matcherHint(assertionName, undefined, undefined, { isNot: context.isNot })}\n\n${failureDetail}`,
  };
}

/** Asserts that the plot shows a tooltip matching the data of the given guess. */
async function toHavePlayerTooltip(plot: TimeBonusPlotComponent, guess: ExpectedGuess, options?: { timeout?: number }) {
  return runMatcher(this, 'toHavePlayerTooltip', innerOptions => assertPlotTooltip(plot, guess, innerOptions), options);
}

/** Asserts that the plot shows a tooltip matching the data of the expected curve point. */
async function toHaveCurveTooltip(
  plot: TimeBonusPlotComponent,
  expected: ExpectedCurveData,
  options?: { timeout?: number }
) {
  return runMatcher(
    this,
    'toHaveCurveTooltip',
    async innerOptions => {
      await baseExpect(plot.tooltip).toBeVisible(innerOptions);
      await baseExpect(plot.tooltipMultiplier).toHaveText(expected.multiplierText, innerOptions);
      await baseExpect(plot.tooltipTime).toHaveText(`Time: ${expected.timeText}s`, innerOptions);
      await baseExpect(plot.tooltipTitle).toHaveCount(0, innerOptions);
      baseExpect(await plot.getTooltipAccentColor()).toBe(CURVE_ACCENT_COLOR);
    },
    options
  );
}

/** Asserts that there is no data tooltip at all shown on the plot. */
async function toHaveNoTooltip(plot: TimeBonusPlotComponent, options?: { timeout?: number }) {
  return runMatcher(
    this,
    'toHaveNoTooltip',
    async innerOptions => {
      await baseExpect(plot.tooltip).toHaveCount(0, innerOptions);
      await baseExpect(plot.hoveredMarkers).toHaveCount(0, innerOptions);
      await baseExpect(plot.curveHoverIndicator).toHaveCount(0, innerOptions);
    },
    options
  );
}

/** Asserts that the marker of the given player guess is currently focused. */
async function toHaveMarkerFocused(plot: TimeBonusPlotComponent, guess: ExpectedGuess, options?: { timeout?: number }) {
  return runMatcher(
    this,
    'toHaveMarkerFocused',
    async innerOptions => {
      const marker = plot.markerFor(guess);
      await baseExpect(marker).toBeFocused(innerOptions);
      await baseExpect(marker).toHaveAttribute('tabindex', '0', innerOptions);
      await baseExpect(plot.tabStopTarget).toHaveCount(1, innerOptions);
      await assertPlotTooltip(plot, guess, innerOptions);
      await assertHighlightedMarker(plot, guess, innerOptions);
    },
    options
  );
}

/** Asserts that the correct player guess marker is currently highlighted (i.e. drawn in bold styles).*/
async function toHaveHighlightedMarkerFor(
  plot: TimeBonusPlotComponent,
  guess: ExpectedGuess,
  options?: { timeout?: number }
) {
  return runMatcher(
    this,
    'toHaveHighlightedMarkerFor',
    innerOptions => assertHighlightedMarker(plot, guess, innerOptions),
    options
  );
}

/**
 * Asserts that the plot displays exactly the guesses within the given time range, each at the exact positions that
 * range dictates, and that the curve is cut off at both edges of the plot.
 */
async function toShowTimeRange(
  plot: TimeBonusPlotComponent,
  guesses: ExpectedGuess[],
  range: TimeRange,
  options?: { timeout?: number }
) {
  const toPlotX = (time: number) => ((time - range.minTime) / (range.maxTime - range.minTime)) * PLOT_WIDTH;
  const expected = guesses.filter(guess => guess.time >= range.minTime && guess.time <= range.maxTime);
  const expectedXs = expected.map(guess => toPlotX(guess.time));

  return runMatcher(
    this,
    'toShowTimeRange',
    async () => {
      const markers = await plot.getFocusableMarkers();
      baseExpect(markers.map(marker => marker.label)).toEqual(expected.map(guess => guess.label));
      markers.forEach((marker, i) => baseExpect(marker.plotX).toBeCloseTo(expectedXs[i], 1));

      const svgXsAscending = (await plot.getSvgMarkerPlotXs()).sort((a, b) => a - b);
      baseExpect(svgXsAscending).toHaveLength(expectedXs.length);
      svgXsAscending.forEach((x, i) => baseExpect(x).toBeCloseTo(expectedXs[i], 1));

      const curveXs = await plot.getCurveSamplesPlotXs();
      baseExpect(curveXs[0]).toBeCloseTo(0, 2);
      baseExpect(curveXs[curveXs.length - 1]).toBeCloseTo(PLOT_WIDTH, 1);
      baseExpect(curveXs).toEqual([...curveXs].sort((a, b) => a - b));
    },
    options
  );
}

/** Asserts that the plot's tooltip is placed right above the given player guess point. */
async function toHaveTooltipAnchoredTo(
  plot: TimeBonusPlotComponent,
  guess: ExpectedGuess,
  options?: { timeout?: number }
) {
  const marker = plot.markerFor(guess);
  return runMatcher(
    this,
    'toHaveTooltipAnchoredTo',
    async innerOptions => {
      await baseExpect(plot.tooltip).toBeVisible(innerOptions);
      await baseExpect(marker).toBeAttached(innerOptions);
      const [tooltipLeft, markerLeft] = await Promise.all([
        plot.tooltip.evaluate(tooltip => (tooltip as HTMLElement).style.left),
        marker.evaluate(target => (target as HTMLElement).style.left),
      ]);
      baseExpect(markerLeft).not.toBe('');
      baseExpect(tooltipLeft).toBe(markerLeft);
    },
    options
  );
}

/** Asserts that the whole time bonus plot is currently visible in the client's visible. */
async function toBeFullyInViewport(plot: TimeBonusPlotComponent, options?: { timeout?: number }) {
  const assertionName = 'toBeFullyInViewport';
  let pass: boolean;
  let actual: unknown;
  let hasActual = false;

  try {
    const poller = baseExpect.poll(() => plot.isPlotFullyInViewport(), { timeout: options?.timeout });
    await poller.toBe(!this.isNot);
    pass = true;
  } catch (e: unknown) {
    const matcherResult =
      typeof e === 'object' && e !== null && 'matcherResult' in e
        ? (e as { matcherResult?: { actual?: unknown } }).matcherResult
        : undefined;
    if (matcherResult && 'actual' in matcherResult) {
      actual = matcherResult.actual;
      hasActual = true;
    }
    pass = false;
  }

  if (this.isNot) pass = !pass;

  return {
    pass,
    name: assertionName,
    message: () =>
      this.utils.matcherHint(assertionName, undefined, undefined, { isNot: this.isNot }) +
      '\n\n' +
      `Expected plot to ${this.isNot ? 'not ' : ''}be fully within the viewport\n` +
      (hasActual ? `Received: ${this.utils.printReceived(actual)}` : ''),
  };
}
