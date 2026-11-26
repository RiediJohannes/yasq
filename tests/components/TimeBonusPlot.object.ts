import { CDPSession, expect, Locator, Page } from '@playwright/test';

import { getDisplayName, PlayerTimeBonusPoint, TimeBonusSummary } from '@yasq/shared';

import type { TimeBonusPlotPayload } from '../../client/src/backend/apiFacade';

export const PLAYER_SNAP_THRESHOLD = 16;
export const PLOT_WIDTH = 600;
export const CURVE_ACCENT_COLOR = 'var(--color-curve)';
const MIN_PLAYER_SPACING_MS = 0.1;
const EDGE_MARGIN = 10;

export type TimeBonusSample = TimeBonusPlotPayload & {
  timeBonusSummary: TimeBonusSummary;
  currentPlayerId: string | null;
};

/** The range of the time domain that the plot currently displays. */
export interface TimeRange {
  minTime: number;
  maxTime: number;
}

export interface ExpectedGuess extends PlayerTimeBonusPoint {
  index: number;
  name: string;
  isCurrentPlayer: boolean;
  markerColor: string;
  multiplierText: string;
  timeText: string;
  label: string;
}

export interface ExpectedCurveData {
  multiplierText: string;
  timeText: string;
}

export interface MarkerSnapshot {
  label: string;
  plotX: number;
}

export interface MarkerAppearance {
  color: string;
  isCurrent: boolean;
  hasChevron: boolean;
  shape: 'circle' | 'cross';
}

export interface HookSamples {
  isLoading: boolean;
  samples: Record<string, TimeBonusPlotPayload>;
}

export const unzoomedRange = ({ timeBonusSummary }: TimeBonusSample): TimeRange => ({
  minTime: 0,
  maxTime: timeBonusSummary.totalTime,
});

const expectedMarkerColor = (guess: PlayerTimeBonusPoint, isCurrentPlayer: boolean) => {
  if (guess.multiplier === null) {
    return isCurrentPlayer ? 'var(--color-marker-current)' : 'var(--color-marker-incorrect)';
  }
  return guess.fullyCorrect ? 'var(--color-marker-correct)' : 'var(--color-marker-partial)';
};

const toExpectedGuesses = ({ participants, timeBonusSummary, currentPlayerId }: TimeBonusSample): ExpectedGuess[] => {
  const sorted = [...timeBonusSummary.playerGuessTimes].sort(
    (a, b) => a.time - b.time || a.playerId.localeCompare(b.playerId)
  );

  const spaced: PlayerTimeBonusPoint[] = [];
  for (const guess of sorted) {
    const predecessorTime = spaced.at(-1)?.time ?? Number.NEGATIVE_INFINITY;
    spaced.push({ ...guess, time: Math.max(guess.time, predecessorTime + MIN_PLAYER_SPACING_MS) });
  }

  return spaced.map((guess, index) => {
    const isCurrentPlayer = guess.playerId === currentPlayerId;
    const participant = participants.find(p => p.id === guess.playerId);
    const name = isCurrentPlayer ? 'You' : participant ? getDisplayName(participant) : 'Unknown Player';
    const timeText = (guess.time / 1000).toFixed(1);
    const multiplierText = guess.multiplier === null ? 'Incorrect' : `${(100 * guess.multiplier).toFixed(1)}%`;
    const resultText = guess.multiplier === null ? 'incorrect' : multiplierText;
    const markerColor = expectedMarkerColor(guess, isCurrentPlayer);
    return {
      ...guess,
      index,
      name,
      isCurrentPlayer,
      markerColor,
      timeText,
      multiplierText,
      label: `${name}: ${resultText}, ${timeText} seconds`,
    };
  });
};

const expectedCurveTooltip = (
  summary: TimeBonusSummary,
  pointerTimeMs: number,
  range: TimeRange = { minTime: 0, maxTime: summary.totalTime }
): ExpectedCurveData => {
  const { curvePoints } = summary;

  const multiplierAt = (time: number) => {
    const nextIndex = curvePoints.findIndex(point => point.time >= time);
    if (nextIndex === -1) return curvePoints[curvePoints.length - 1].multiplier;
    if (nextIndex === 0) return curvePoints[0].multiplier;

    const previous = curvePoints[nextIndex - 1];
    const next = curvePoints[nextIndex];
    const ratio = (time - previous.time) / (next.time - previous.time);
    return previous.multiplier + ratio * (next.multiplier - previous.multiplier);
  };

  const distance = (point: { time: number }) => Math.abs(pointerTimeMs - point.time);
  const closest = curvePoints.reduce((best, point) => (distance(point) < distance(best) ? point : best));
  // The curve is cut off at the edges of the displayed range, and these artificial end points can be hovered too
  const leftEnd = { time: range.minTime, multiplier: multiplierAt(range.minTime) };
  const rightEnd = { time: range.maxTime, multiplier: multiplierAt(range.maxTime) };

  let target = closest;
  if (distance(leftEnd) <= distance(closest)) target = leftEnd;
  else if (distance(rightEnd) <= distance(closest)) target = rightEnd;

  return {
    multiplierText: `${(100 * target.multiplier).toFixed(1)}%`,
    timeText: (target.time / 1000).toFixed(1),
  };
};

const findLargestGap = (markerPlotXs: number[], step = 5): { plotX: number; distance: number } => {
  let best = { plotX: EDGE_MARGIN, distance: -1 };
  for (let plotX = EDGE_MARGIN; plotX <= PLOT_WIDTH - EDGE_MARGIN; plotX += step) {
    const distance = Math.min(...markerPlotXs.map(markerX => Math.abs(markerX - plotX)));
    if (distance > best.distance) best = { plotX, distance };
  }
  return best;
};

/**
 * Finds a player with enough free room on one side to place the pointer `offset` plot units away while still
 * clearly remaining the closest player.
 */
export const findIsolatedMarker = (
  markerPlotXs: number[],
  offset: number
): { markerIndex: number; pointerPlotX: number } | null => {
  for (let i = 0; i < markerPlotXs.length; i++) {
    for (const direction of [1, -1]) {
      const targetPlotX = markerPlotXs[i] + direction * offset;
      if (targetPlotX < offset || targetPlotX > PLOT_WIDTH - offset) continue;

      const otherDistances = markerPlotXs.filter((_, other) => other !== i).map(x => Math.abs(x - targetPlotX));
      if (Math.min(...otherDistances, Number.POSITIVE_INFINITY) > offset + 1)
        return { markerIndex: i, pointerPlotX: targetPlotX };
    }
  }
  return null;
};

type Mount = (story: string) => Promise<Locator>;

export const readHookSamples = async (component: Locator): Promise<HookSamples> => {
  const rawDataJson = await component.locator('#hook-samples').getAttribute('data-payload');
  if (rawDataJson === null) throw new Error('The story did not serialize the hook samples into #hook-samples');
  return JSON.parse(rawDataJson) as HookSamples;
};

export class TimeBonusPlotPeripherals {
  readonly beforeBtn: Locator;
  readonly afterBtn: Locator;
  readonly escapeCount: Locator;

  constructor(component: Locator) {
    const page = component.page();
    this.beforeBtn = page.locator('#before-plot');
    this.afterBtn = page.locator('#after-plot');
    this.escapeCount = page.locator('#escape-count');
  }
}

export class TimeBonusPlotComponent {
  readonly component: Locator;
  readonly page: Page;
  readonly dataDump: Locator;

  readonly plotArea: Locator;
  readonly svg: Locator;
  readonly curveLine: Locator;
  readonly playerMarkers: Locator;
  readonly currentMarkers: Locator;
  readonly hoveredMarkers: Locator;
  readonly curveHoverIndicator: Locator;
  readonly tooltip: Locator;
  readonly tooltipTitle: Locator;
  readonly tooltipMultiplier: Locator;
  readonly tooltipTime: Locator;
  readonly zoomButton: Locator;

  readonly markerTargets: Locator;
  readonly tabStopTarget: Locator;
  readonly focusedTarget: Locator;

  private cdpSession?: CDPSession;

  public static async create(mount: Mount, story = 'TimeBonusPlot/Linear') {
    const component = await mount(story);
    const plot = new TimeBonusPlotComponent(component);
    const peripherals = new TimeBonusPlotPeripherals(component);

    const samples = await plot.readSamples();
    const guesses = toExpectedGuesses(samples);

    await expect(plot.markerTargets).toHaveCount(guesses.length);
    expect(guesses.length, 'sample data needs at least 3 player guesses').toBeGreaterThanOrEqual(3);

    return { plot, peripherals, samples, guesses };
  }

  constructor(component: Locator) {
    this.component = component;
    this.page = component.page();
    this.dataDump = component.locator('#plot-data');

    this.plotArea = component.locator('.time-bonus-plot-area').first();
    this.svg = component.locator('.time-bonus-plot').first();
    this.curveLine = this.svg.locator('.curve-line');
    this.playerMarkers = this.svg.locator('.player-marker');
    this.currentMarkers = this.svg.locator('.player-marker.current');
    this.hoveredMarkers = this.svg.locator('.player-marker.is-hovered');
    this.curveHoverIndicator = this.svg.locator('.curve-hover-indicator');

    this.tooltip = component.locator('.plot-tooltip').first();
    this.tooltipTitle = this.tooltip.locator('.tooltip-title');
    this.tooltipMultiplier = this.tooltip.locator('.tooltip-multiplier');
    this.tooltipTime = this.tooltip.locator('.tooltip-time');
    this.zoomButton = component.locator('.zoom-lens-btn');

    const keyboardLayer = component.locator('.plot-keyboard-layer').first();
    this.markerTargets = keyboardLayer.locator('.plot-keyboard-target');
    this.tabStopTarget = keyboardLayer.locator('.plot-keyboard-target[tabindex="0"]');
    this.focusedTarget = keyboardLayer.locator('.plot-keyboard-target:focus');
  }

  async getFocusableMarkers(): Promise<MarkerSnapshot[]> {
    return this.markerTargets.evaluateAll(
      (targets, plotWidth) =>
        targets.map(target => ({
          label: target.getAttribute('aria-label') ?? '',
          plotX: (parseFloat((target as HTMLElement).style.left) / 100) * plotWidth,
        })),
      PLOT_WIDTH
    );
  }

  async getMarkerPlotXs(): Promise<number[]> {
    return (await this.getFocusableMarkers()).map(marker => marker.plotX);
  }

  /** Horizontal positions of the SVG player markers in plot units, in rendering order. */
  async getSvgMarkerPlotXs(): Promise<number[]> {
    return this.playerMarkers
      .locator('.player-line')
      .evaluateAll(lines => lines.map(line => parseFloat(line.getAttribute('x1') ?? 'NaN')));
  }

  /** Horizontal positions of the vertices of the curve path in plot units. */
  async getCurveSamplesPlotXs(): Promise<number[]> {
    const path = (await this.curveLine.getAttribute('d')) ?? '';
    return path
      .replace(/^M /, '')
      .split(' L ')
      .map(vertex => parseFloat(vertex.split(',')[0]));
  }

  async getTooltipAccentColor(): Promise<string> {
    return this.tooltip.evaluate(tooltip => (tooltip as HTMLElement).style.borderColor);
  }

  /** Describes how the single highlighted (hovered or focused) marker is drawn. */
  async getHighlightedMarkerAppearance(): Promise<MarkerAppearance> {
    return this.hoveredMarkers.evaluate(marker => ({
      color: (marker as SVGElement).style.getPropertyValue('--marker-color'),
      isCurrent: marker.classList.contains('current'),
      hasChevron: marker.querySelector('.player-chevron') !== null,
      shape: marker.querySelector('.player-node-x') !== null ? ('cross' as const) : ('circle' as const),
    }));
  }

  markerFor(guess: ExpectedGuess): Locator {
    return this.component.getByRole('img', { name: guess.label, exact: true });
  }

  /** Returns the pixel coordinates in the client's viewport of some point within the plot at the given plot X coordinate */
  async clientPointAtPlotX(plotX: number): Promise<{ x: number; y: number; timeFraction: number }> {
    const svg = await this.svgRect();
    // Round X to whole pixels so the browser receives the exact coordinate used to compute expectations
    const x = Math.min(
      Math.max(Math.round(svg.x + (plotX / PLOT_WIDTH) * svg.width), Math.ceil(svg.x)),
      Math.floor(svg.x + svg.width) - 1
    );
    const y = Math.round(svg.y + svg.height * 0.6);
    return { x, y, timeFraction: (x - svg.x) / svg.width };
  }

  async hoverAtPlotX(plotX: number): Promise<{ timeFraction: number }> {
    const { x, y, timeFraction } = await this.clientPointAtPlotX(plotX);
    await this.page.mouse.move(x, y);
    return { timeFraction };
  }

  /** Hovers the marker of a guess, wherever it is currently displayed (also when zoomed in). */
  async hoverGuess(guess: ExpectedGuess) {
    const marker = (await this.getFocusableMarkers()).find(candidate => candidate.label === guess.label);
    if (!marker) throw new Error(`No marker is displayed for "${guess.label}"`);
    await this.hoverAtPlotX(marker.plotX);
  }

  /** Hovers the curve at a position of the plot and returns the tooltip this should show. */
  async hoverCurveAt(
    plotX: number,
    samples: TimeBonusSample,
    range: TimeRange = unzoomedRange(samples)
  ): Promise<ExpectedCurveData> {
    const { timeFraction } = await this.hoverAtPlotX(plotX);
    const pointerTime = range.minTime + timeFraction * (range.maxTime - range.minTime);
    return expectedCurveTooltip(samples.timeBonusSummary, pointerTime, range);
  }

  async hoverAwayFromPlayers(samples: TimeBonusSample, range?: TimeRange): Promise<ExpectedCurveData> {
    const SAFETY_TOLERANCE = 5;
    const gap = findLargestGap(await this.getMarkerPlotXs());

    expect(
      gap.distance,
      `sample data needs a spot at least ${PLAYER_SNAP_THRESHOLD + SAFETY_TOLERANCE} plot units away from all players`
    ).toBeGreaterThan(PLAYER_SNAP_THRESHOLD + SAFETY_TOLERANCE);

    return this.hoverCurveAt(gap.plotX, samples, range);
  }

  async touchStart(point: { x: number; y: number }) {
    await this.dispatchTouch('touchStart', [{ x: point.x, y: point.y }]);
  }

  async touchMove(target: { x: number; y: number }) {
    await this.dispatchTouch('touchMove', [{ x: target.x, y: target.y }]);
  }

  async touchEnd() {
    await this.dispatchTouch('touchEnd', []);
  }

  /** Hits tab repeatedly until some marker in the plot area is in focus. */
  async tabIntoPlotArea(reverse: boolean = false, maxPresses: number = 10) {
    const keyCombination = reverse ? 'Shift+Tab' : 'Tab';

    for (let presses = 0; presses < maxPresses; presses++) {
      if ((await this.focusedTarget.count()) > 0) return;
      await this.page.keyboard.press(keyCombination);
    }

    await expect(this.focusedTarget, 'tabbing never reached a player marker').toHaveCount(1);
  }

  async zoomIn(viaKeyboard = false) {
    await this.pressZoomButton(viaKeyboard);
    await expect(this.zoomButton).toHaveAttribute('aria-label', 'Reset zoom');
  }

  async zoomOut(viaKeyboard = false) {
    await this.pressZoomButton(viaKeyboard);
    await expect(this.zoomButton).toHaveAttribute('aria-label', 'Zoom into players');
  }

  async isPlotFullyInViewport(): Promise<boolean> {
    return this.plotArea.evaluate(area => {
      const rect = area.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
  }

  private async readSamples(): Promise<TimeBonusSample> {
    const rawDataJson = await this.dataDump.getAttribute('data-payload');
    if (rawDataJson === null) throw new Error('The story did not serialize its sample data into #plot-data');

    const testData = JSON.parse(rawDataJson) as TimeBonusPlotPayload;
    if (!testData.timeBonusSummary) throw new Error('Sample payload is missing timeBonusSummary');

    return {
      participants: testData.participants,
      timeBonusSummary: testData.timeBonusSummary,
      currentPlayerId: (testData as { currentPlayerId?: string | null }).currentPlayerId ?? null,
    } satisfies TimeBonusSample;
  }

  private async pressZoomButton(viaKeyboard: boolean) {
    if (viaKeyboard) {
      await this.zoomButton.focus();
      await this.page.keyboard.press('Enter');
    } else {
      await this.zoomButton.click();
    }
  }

  private async svgRect() {
    return this.svg.evaluate(svg => {
      const rect = svg.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  }

  private async dispatchTouch(type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: { x: number; y: number }[]) {
    // Playwright's touchscreen can only tap, so held touches are dispatched via CDP (Chromium only)
    this.cdpSession ??= await this.page.context().newCDPSession(this.page);
    await this.cdpSession.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
}
