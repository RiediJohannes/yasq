import { test } from '@playwright/test';

import { MAX_TIME_MULTIPLIER, MIN_TIME_MULTIPLIER, TimeBonus } from '@yasq/shared';

import { expect } from './TimeBonusPlot.assertions';
import {
  ExpectedGuess,
  findIsolatedMarker,
  PLAYER_SNAP_THRESHOLD,
  readHookSamples,
  TimeBonusPlotComponent,
  TimeRange,
  unzoomedRange,
} from './TimeBonusPlot.object';

/** The visible time ranges when zoomed into the custom scenarios. See the component's story file for how they come about. */
const ZOOMABLE_RANGE: TimeRange = { minTime: 23_280, maxTime: 30_720 };
const NEAR_END_RANGE: TimeRange = { minTime: 55_200, maxTime: 60_000 };

const guessesWithinRange = (guesses: ExpectedGuess[], range: TimeRange) =>
  guesses.filter(guess => guess.time >= range.minTime && guess.time <= range.maxTime);

const guessAtTime = (guesses: ExpectedGuess[], time: number) => {
  const guess = guesses.find(candidate => candidate.time === time);
  if (!guess) throw new Error(`The scenario has no guess at ${time}ms`);
  return guess;
};

const nearestCandidateGuess = (target: ExpectedGuess, candidates: ExpectedGuess[]) =>
  candidates.reduce((best, guess) =>
    Math.abs(guess.time - target.time) < Math.abs(best.time - target.time) ? guess : best
  );

const expectEveryGuessToBeHoverable = async (plot: TimeBonusPlotComponent, guesses: ExpectedGuess[]) => {
  for (const guess of guesses) {
    await test.step(`hover ${guess.name} (${guess.multiplierText} at ${guess.timeText}s)`, async () => {
      await plot.hoverGuess(guess);
      await expect(plot).toHavePlayerTooltip(guess);
      await expect(plot).toHaveHighlightedMarkerFor(guess);
      await expect(plot).toHaveTooltipAnchoredTo(guess);
    });
  }
};

test.describe('TimeBonusPlot - Hover Interaction', () => {
  test('should not show any tooltip or highlight any marker/point before the plot is hovered', async ({ mount }) => {
    const { plot } = await TimeBonusPlotComponent.create(mount);

    await expect(plot).toHaveNoTooltip();
    await expect(plot.hoveredMarkers).toHaveCount(0);
    await expect(plot.focusedTarget).toHaveCount(0);
    await expect(plot.curveHoverIndicator).toHaveCount(0);
  });

  test('should show a player tooltip and highlight the marker when hovering a player point', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.hoverGuess(guesses[0]);

    await expect(plot).toHavePlayerTooltip(guesses[0]);
    await expect(plot.hoveredMarkers).toHaveCount(1);
    await expect(plot.curveHoverIndicator).toHaveCount(0);

    // The hovered marker is drawn last to be on top of all others
    expect(await plot.playerMarkers.count()).toBeGreaterThan(1);
    await expect(plot.playerMarkers.last()).toHaveClass(/is-hovered/);
  });

  test('should snap to the closest player when the pointer is near a marker', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    const spot = findIsolatedMarker(await plot.getMarkerPlotXs(), PLAYER_SNAP_THRESHOLD - 2);
    expect(
      spot,
      `sample data needs a player with ${PLAYER_SNAP_THRESHOLD - 2} units of empty room right next to it to check snapping behaviour`
    ).not.toBeNull();

    await plot.hoverAtPlotX(spot!.pointerPlotX);

    const closestGuess = guesses[spot!.markerIndex];
    await expect(plot).toHavePlayerTooltip(closestGuess);
    await expect(plot).toHaveHighlightedMarkerFor(closestGuess);
    await expect(plot.curveHoverIndicator).toHaveCount(0);
  });

  test('should show a curve tooltip with a hover indicator when no player is nearby', async ({ mount }) => {
    const { plot, samples } = await TimeBonusPlotComponent.create(mount);

    const expectedTooltip = await plot.hoverAwayFromPlayers(samples);

    await expect(plot).toHaveCurveTooltip(expectedTooltip);
    await expect(plot.curveHoverIndicator).toHaveCount(1);
    await expect(plot.hoveredMarkers).toHaveCount(0);
  });

  test('should switch between player and curve targets as the mouse moves', async ({ mount }) => {
    const { plot, samples, guesses } = await TimeBonusPlotComponent.create(mount);
    const last = guesses[guesses.length - 1];

    await plot.hoverGuess(guesses[0]);
    await expect(plot).toHavePlayerTooltip(guesses[0]);

    const expectedCurveTooltip = await plot.hoverAwayFromPlayers(samples);
    await expect(plot).toHaveCurveTooltip(expectedCurveTooltip);
    await expect(plot.curveHoverIndicator).toHaveCount(1);
    await expect(plot.hoveredMarkers).toHaveCount(0);

    await plot.hoverGuess(last);
    await expect(plot).toHavePlayerTooltip(last);
    await expect(plot.curveHoverIndicator).toHaveCount(0);
    await expect(plot.hoveredMarkers).toHaveCount(1);
  });

  test('should hide the tooltip and all highlights when the mouse leaves the plot', async ({ mount }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);

    const targetedGuess = guesses[1];
    await plot.hoverGuess(targetedGuess);
    await expect(plot).toHavePlayerTooltip(targetedGuess);
    await expect(plot).toHaveHighlightedMarkerFor(targetedGuess);

    await peripherals.beforeBtn.hover();

    await expect(plot).toHaveNoTooltip();
    await expect(plot).not.toHaveHighlightedMarkerFor(targetedGuess);
    await expect(plot.hoveredMarkers).toHaveCount(0);
  });

  test('should clear the plot hover state when the mouse moves onto the zoom button', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');

    const targetedGuess = guesses[1];
    await plot.hoverGuess(targetedGuess);
    await expect(plot).toHavePlayerTooltip(targetedGuess);
    await expect(plot).toHaveHighlightedMarkerFor(targetedGuess);

    await plot.zoomButton.hover();

    await expect(plot).toHaveNoTooltip();
    await expect(plot).not.toHaveHighlightedMarkerFor(targetedGuess);
    await expect(plot.hoveredMarkers).toHaveCount(0);
  });

  test('should show the sampled data of every player when hovering their markers', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await expectEveryGuessToBeHoverable(plot, guesses);
  });
});

test.describe('TimeBonusPlot - Keyboard Interaction', () => {
  test('should treat the group of all player markers as a single tab stop', async ({ mount, page }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    // The first marker is focused by default
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    // All other markers have tabindex -1 (focusable but not the start of a tab group)
    for (const guess of guesses.slice(1)) {
      await expect(plot.markerFor(guess)).toHaveAttribute('tabindex', '-1');
    }

    await page.keyboard.press('Tab');

    await expect(peripherals.afterBtn).toBeFocused();
    await expect(plot.focusedTarget).toHaveCount(0);
  });

  test('should show the tooltip and highlight the marker of the focused player', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    expect(await plot.markerTargets.count()).toBeGreaterThan(1);
    const middleGuess = guesses[Math.floor(guesses.length / 2)];

    await plot.markerFor(middleGuess).focus();

    await expect(plot).toHaveMarkerFocused(middleGuess);
    await expect(plot).toHavePlayerTooltip(middleGuess);
    await expect(plot.curveHoverIndicator).toHaveCount(0);

    // Highlighting moves the marker to the end of the SVG. The focus must survive that re-ordering.
    await expect(plot.playerMarkers.last()).toHaveClass(/is-hovered/);
    await expect(plot.markerFor(middleGuess)).toBeFocused();
  });

  test('should move between players with the arrow keys and wrap around at both ends', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    for (const guess of guesses.slice(1)) {
      await page.keyboard.press('ArrowRight');
      await expect(plot).toHaveMarkerFocused(guess);
    }

    await page.keyboard.press('ArrowRight'); // wraps from the last to the first player
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    await page.keyboard.press('ArrowLeft'); // wraps from the first to the last player
    await expect(plot).toHaveMarkerFocused(guesses[guesses.length - 1]);

    await page.keyboard.press('ArrowLeft');
    await expect(plot).toHaveMarkerFocused(guesses[guesses.length - 2]);
  });

  test('should return to the last focused player when tabbing back into the plot', async ({ mount, page }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(plot).toHaveMarkerFocused(guesses[2]);

    await page.keyboard.press('Tab');
    await expect(peripherals.afterBtn).toBeFocused();
    await expect(plot).not.toHaveMarkerFocused(guesses[2]);

    await page.keyboard.press('Shift+Tab');

    await expect(plot).toHaveMarkerFocused(guesses[2]);
    await expect(peripherals.afterBtn).not.toBeFocused();
  });

  test('should hide the tooltip when focus leaves the plot', async ({ mount, page }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    await page.keyboard.press('Tab');

    await expect(peripherals.afterBtn).toBeFocused();
    await expect(plot).not.toHaveMarkerFocused(guesses[0]);
    await expect(plot).toHaveNoTooltip();
  });

  test('should expose each player guess as a labelled image inside a labelled group', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await expect(plot.component.getByRole('group', { name: /Player guesses/ })).toBeAttached();
    for (const guess of guesses) {
      await expect(plot.markerFor(guess)).toBeAttached();
    }
  });

  test('should show the sampled data of every player when navigating with the keyboard', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();

    for (const guess of guesses) {
      await test.step(`focus ${guess.name} (${guess.multiplierText} at ${guess.timeText}s)`, async () => {
        if (guess.index > 0) await page.keyboard.press('ArrowRight');
        await expect(plot).toHaveMarkerFocused(guess);
      });
    }
  });

  test('should scroll the whole plot into view when keyboard focus enters it', async ({ mount }) => {
    const { plot, peripherals } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/LinearBeyondScreen');

    await peripherals.beforeBtn.focus();
    await expect(plot).not.toBeFullyInViewport();

    // Tabbing in from above
    await plot.tabIntoPlotArea(false, 2);
    await expect(plot).toBeFullyInViewport();

    await peripherals.afterBtn.focus();
    await expect(plot).not.toBeFullyInViewport();

    // Tabbing in from below
    await plot.tabIntoPlotArea(true, 2);
    await expect(plot).toBeFullyInViewport();
  });

  test('should not scroll the page when moving between players', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/LinearBeyondScreen');

    async function getWindowScrollPosition(): Promise<number> {
      return page.evaluate(() => window.scrollY);
    }

    await plot.tabIntoPlotArea();
    await expect(plot).toBeFullyInViewport();
    const scrollYOnEntry = await getWindowScrollPosition();

    await page.keyboard.press('ArrowRight');
    await expect(plot).toHaveMarkerFocused(guesses[1]);
    await page.keyboard.press('End');
    await expect(plot).toHaveMarkerFocused(guesses[guesses.length - 1]);

    expect(await getWindowScrollPosition()).toBe(scrollYOnEntry);
  });

  test('should dismiss the tooltip on Escape but show it again on the next arrow key press', async ({
    mount,
    page,
  }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    await page.keyboard.press('Escape');

    await expect(plot).toHaveNoTooltip();
    await expect(plot.markerFor(guesses[0])).toBeFocused();

    await page.keyboard.press('ArrowRight');

    await expect(plot).toHaveMarkerFocused(guesses[1]);
  });

  test('should let Escape events pass through to parents when there is no tooltip to dismiss', async ({
    mount,
    page,
  }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    // The first Escape only closes the tooltip and does not bubble up
    await page.keyboard.press('Escape');
    await expect(plot).toHaveNoTooltip();
    await expect(peripherals.escapeCount).toHaveText('0');

    // With nothing left to dismiss, the Escape comes through to the parent
    await page.keyboard.press('Escape');
    await expect(peripherals.escapeCount).toHaveText('1');
  });
});

test.describe('TimeBonusPlot - Mouse+Keyboard interfering', () => {
  test('should let the mouse override the tooltip of a focused marker and restore it when the mouse leaves', async ({
    mount,
  }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);
    const last = guesses[guesses.length - 1];

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);

    await plot.hoverGuess(last);
    await expect(plot).toHavePlayerTooltip(last);
    await expect(plot.hoveredMarkers).toHaveCount(1);
    await expect(plot.markerFor(guesses[0])).toBeFocused(); // hovering never moves focus

    await peripherals.beforeBtn.hover();

    await expect(plot).toHavePlayerTooltip(guesses[0]); // the focused marker's tooltip is back
    await expect(plot.hoveredMarkers).toHaveCount(1);
  });

  test('should let keyboard navigation override the tooltip of a resting mouse', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);
    const last = guesses[guesses.length - 1];

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);
    await plot.hoverGuess(last);
    await expect(plot).toHavePlayerTooltip(last);

    await page.keyboard.press('ArrowRight');

    await expect(plot).toHaveMarkerFocused(guesses[1]);
  });

  test('should keep a mouse-owned tooltip when focus leaves the plot', async ({ mount, page }) => {
    const { plot, peripherals, guesses } = await TimeBonusPlotComponent.create(mount);
    const last = guesses[guesses.length - 1];

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);
    await plot.hoverGuess(last);
    await expect(plot).toHavePlayerTooltip(last);

    await page.keyboard.press('Tab');
    await expect(peripherals.afterBtn).toBeFocused();

    await expect(plot).toHavePlayerTooltip(last); // still the mouse's tooltip

    await peripherals.beforeBtn.hover();

    await expect(plot).toHaveNoTooltip(); // now the tooltip is gone
  });

  test('should not bring the tooltip back when the mouse leaves after it was dismissed', async ({ mount, page }) => {
    const { plot, peripherals, samples, guesses } = await TimeBonusPlotComponent.create(mount);

    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(guesses[0]);
    // Dismiss the tooltip
    await page.keyboard.press('Escape');
    await expect(plot).toHaveNoTooltip();

    // Mouse tooltips keep working while a marker is focused
    const hoveredCurveData = await plot.hoverAwayFromPlayers(samples);
    await expect(plot).toHaveCurveTooltip(hoveredCurveData);

    await peripherals.beforeBtn.hover();

    // Focus didn't bring back the tooltip because we explicitly dismissed it
    await expect(plot.markerFor(guesses[0])).toBeFocused(); // DOM focus is still there
    await expect(plot).not.toHaveMarkerFocused(guesses[0]); // but no visible focus
    await expect(plot).toHaveNoTooltip(); // and no tooltip
  });
});

test.describe('TimeBonusPlot - Player Markers', () => {
  /** The four possible styles of a player guess marker */
  const MARKERS = {
    correct: { color: 'var(--color-marker-correct)', shape: 'circle' },
    partial: { color: 'var(--color-marker-partial)', shape: 'circle' },
    incorrect: { color: 'var(--color-marker-incorrect)', shape: 'cross' },
    current: { color: 'var(--color-marker-current)', shape: 'cross' },
  } as const;
  type MarkerKind = keyof typeof MARKERS;

  /** What the marker of each guess in the default scenario (by answer time in ms) has to look like */
  const GUESS_MARKER_KINDS: Record<number, MarkerKind> = {
    3_800: 'correct',
    6_800: 'correct',
    9_100: 'partial',
    16_900: 'incorrect',
    24_100: 'correct',
    28_000: 'partial',
  };

  const scenarios: { story: string; currentTime: number | null; kinds: Record<number, MarkerKind> }[] = [
    { story: 'Linear', currentTime: null, kinds: GUESS_MARKER_KINDS },
    { story: 'LinearAsCorrectPlayer', currentTime: 24_100, kinds: GUESS_MARKER_KINDS },
    { story: 'LinearAsIncorrectPlayer', currentTime: 16_900, kinds: { ...GUESS_MARKER_KINDS, 16_900: 'current' } },
  ];

  test.describe('should draw every marker according to its guess and highlight the current player', () => {
    for (const { story, currentTime, kinds } of scenarios) {
      test(`Scenario: ${story}`, async ({ mount }) => {
        const { plot, guesses } = await TimeBonusPlotComponent.create(mount, `TimeBonusPlot/${story}`);
        await expect(plot.currentMarkers).toHaveCount(currentTime === null ? 0 : 1);

        for (const guess of guesses) {
          await test.step(`${guess.timeText}s`, async () => {
            const expectedKind = MARKERS[kinds[guess.time]];
            const isCurrent = guess.time === currentTime;

            await plot.hoverGuess(guess);

            await expect(plot.tooltipTitle).toHaveText(isCurrent ? 'You' : guess.name);
            await expect
              .poll(() => plot.getHighlightedMarkerAppearance())
              .toEqual({ ...expectedKind, isCurrent, hasChevron: isCurrent });
            await expect.poll(() => plot.getTooltipAccentColor()).toBe(expectedKind.color);
          });
        }
      });
    }
  });

  test('should draw faster guesses on top of slower ones', async ({ mount }) => {
    const { plot, samples, guesses } = await TimeBonusPlotComponent.create(mount);
    await expect(plot).toShowTimeRange(guesses, unzoomedRange(samples));

    // The slowest (right-most) guess has to be drawn first and the fastest (left-most) guess last
    const markerXsInRenderOrder = await plot.getSvgMarkerPlotXs();
    const markerXsInInverseCoordinateOrder = [...markerXsInRenderOrder].sort((x1, x2) => x2 - x1);

    expect(markerXsInRenderOrder).toEqual(markerXsInInverseCoordinateOrder);
  });

  test('should draw the current player on top of all other markers, except the currently hovered one', async ({
    mount,
  }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/LinearAsCorrectPlayer');

    const current = guesses.find(guess => guess.isCurrentPlayer)!;
    const targetGuess = guesses[guesses.length - 1];
    expect(current.index, 'the fastest guess is on top anyway, so this test would prove nothing').toBeGreaterThan(0);
    expect(current, 'the hovered guess must belong to someone else').not.toBe(targetGuess);

    // The current player's guess is on top
    await expect(plot.playerMarkers.last()).toHaveClass(/current/);

    await plot.hoverGuess(targetGuess);

    // The hovered guess takes precedence and is now on top
    await expect(plot).toHavePlayerTooltip(targetGuess);
    await expect(plot.playerMarkers.last()).toHaveClass(/is-hovered/);
    await expect(plot.playerMarkers.nth(guesses.length - 2)).toHaveClass(/current/);
  });
});

test.describe('TimeBonusPlot - Zoom', () => {
  test('should not offer zooming when the successful guesses are spread out over the whole plot', async ({ mount }) => {
    const { plot } = await TimeBonusPlotComponent.create(mount);

    await expect(plot.zoomButton).not.toBeVisible();
  });

  test('should offer zooming when the successful guesses are clustered', async ({ mount }) => {
    const { plot } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');

    await expect(plot.zoomButton).toBeVisible();
    await expect(plot.zoomButton).toHaveAttribute('aria-label', 'Zoom into players');
    await expect(plot.zoomButton).not.toHaveClass(/active/);
  });

  test('should zoom into the padded range of the successful guesses and cut off incorrect ones outside', async ({
    mount,
  }) => {
    const { plot, samples, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    await expect(plot).toShowTimeRange(guesses, unzoomedRange(samples));

    await plot.zoomIn();

    await expect(plot.zoomButton).toHaveClass(/active/);
    await expect(plot).toShowTimeRange(guesses, ZOOMABLE_RANGE);
    const cutOff = guesses.filter(guess => !guessesWithinRange(guesses, ZOOMABLE_RANGE).includes(guess));
    expect(cutOff.every(guess => guess.multiplier === null)).toBe(true);
    expect(cutOff.map(guess => guess.time)).toEqual([4_000, 23_000, 31_000, 45_000]);

    await plot.zoomOut();

    await expect(plot.zoomButton).not.toHaveClass(/active/);
    await expect(plot).toShowTimeRange(guesses, unzoomedRange(samples));
  });

  test('should keep the zoomed range inside the plot and not narrower than the minimum zoom window', async ({
    mount,
  }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/ZoomableNearEnd');

    await plot.zoomIn();

    await expect(plot).toShowTimeRange(guesses, NEAR_END_RANGE);
    const cutOffGuesses = guesses.filter(guess => !guessesWithinRange(guesses, NEAR_END_RANGE).includes(guess));
    expect(cutOffGuesses.map(guess => guess.time)).toEqual([20_000, 55_100]);
  });

  test('should map the pointer to the zoomed time range when hovering players', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    await plot.zoomIn();

    await expectEveryGuessToBeHoverable(plot, guessesWithinRange(guesses, ZOOMABLE_RANGE));
  });

  test('should show curve tooltips of the zoomed time range', async ({ mount }) => {
    const { plot, samples } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    await plot.zoomIn();

    for (const plotX of [0, 599]) {
      await test.step(`hover the curve at plot x=${plotX}`, async () => {
        await expect(plot).toHaveCurveTooltip(await plot.hoverCurveAt(plotX, samples, ZOOMABLE_RANGE));
      });
    }

    await expect(plot).toHaveCurveTooltip(await plot.hoverAwayFromPlayers(samples, ZOOMABLE_RANGE));
    await expect(plot.curveHoverIndicator).toHaveCount(1);
  });

  test('should keep the focused player as the tab stop across zoom changes', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    const player = guessAtTime(guesses, 30_000); // its position in the keyboard order changes when zooming

    await plot.markerFor(player).focus();
    await expect(plot).toHaveMarkerFocused(player);

    await plot.zoomIn(true);
    // The tab stop is re-located in an effect after the render, so wait for it before sending the next key
    await expect(plot.tabStopTarget).toHaveAttribute('aria-label', player.label);
    await page.keyboard.press('Tab');

    await expect(plot).toHaveMarkerFocused(player);
    await expect(plot).toHaveTooltipAnchoredTo(player);

    await plot.zoomOut(true);
    await expect(plot.tabStopTarget).toHaveAttribute('aria-label', player.label);
    await page.keyboard.press('Tab');

    await expect(plot).toHaveMarkerFocused(player);
    await expect(plot).toHaveTooltipAnchoredTo(player);
  });

  test('should move the tab stop to the nearest visible player when its player is zoomed out of view', async ({
    mount,
    page,
  }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    const visible = guessesWithinRange(guesses, ZOOMABLE_RANGE);

    for (const hidden of guesses.filter(guess => !visible.includes(guess))) {
      await test.step(`zoom in while ${hidden.name} (${hidden.timeText}s) is the tab stop`, async () => {
        const nearest = nearestCandidateGuess(hidden, visible);
        await plot.markerFor(hidden).focus();
        await expect(plot).toHaveMarkerFocused(hidden);

        await plot.zoomIn(true);
        await expect(plot.tabStopTarget).toHaveAttribute('aria-label', nearest.label);
        await page.keyboard.press('Tab');

        await expect(plot).toHaveMarkerFocused(nearest);

        await plot.zoomOut(true);
      });
    }
  });

  test('should restore the original tab stop player when zooming back out', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    const hidden = guessAtTime(guesses, 45_000);

    await plot.markerFor(hidden).focus();
    await expect(plot).toHaveMarkerFocused(hidden);

    await plot.zoomIn(true);
    await plot.zoomOut(true);
    await expect(plot.tabStopTarget).toHaveAttribute('aria-label', hidden.label);
    await page.keyboard.press('Tab');

    await expect(plot).toHaveMarkerFocused(hidden);
  });

  test('should only cycle through the visible players with the keyboard while zoomed in', async ({ mount, page }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/Zoomable');
    const visible = guessesWithinRange(guesses, ZOOMABLE_RANGE);

    await plot.zoomIn();
    await plot.tabIntoPlotArea();
    await expect(plot).toHaveMarkerFocused(visible[0]);

    for (const guess of visible.slice(1)) {
      await page.keyboard.press('ArrowRight');
      await expect(plot).toHaveMarkerFocused(guess);
    }

    await page.keyboard.press('ArrowRight');
    await expect(plot).toHaveMarkerFocused(visible[0]);

    await page.keyboard.press('ArrowLeft');
    await expect(plot).toHaveMarkerFocused(visible[visible.length - 1]);

    await page.keyboard.press('Home');
    await expect(plot).toHaveMarkerFocused(visible[0]);

    await page.keyboard.press('End');
    await expect(plot).toHaveMarkerFocused(visible[visible.length - 1]);
  });
});

test.describe('useTimeBonusSamples', () => {
  test('should provide sample data that the plot displays correctly', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount, 'TimeBonusPlot/HookLinear');

    expect(guesses.map(guess => guess.name)).not.toContain('Unknown Player');
    await expectEveryGuessToBeHoverable(plot, guesses);
  });

  test('should provide a consistent sample for every time bonus type', async ({ mount }) => {
    const { isLoading, samples } = await readHookSamples(await mount('TimeBonusPlot/HookAllSamples'));

    expect(isLoading).toBe(false);
    expect(Object.keys(samples).sort()).toEqual(Object.values(TimeBonus).sort());

    for (const [bonusType, { participants, timeBonusSummary }] of Object.entries(samples)) {
      await test.step(bonusType, async () => {
        expect(timeBonusSummary).not.toBeNull();
        const { totalTime, curvePoints, playerGuessTimes } = timeBonusSummary!;

        expect(totalTime).toBeGreaterThan(0);
        expect(curvePoints.length).toBeGreaterThan(1);
        const curveTimes = curvePoints.map(point => point.time);
        expect(curveTimes).toEqual([...curveTimes].sort((a, b) => a - b)); // the plot binary-searches the curve

        const multipliers = [
          ...curvePoints.map(point => point.multiplier),
          ...playerGuessTimes.flatMap(guess => guess.multiplier ?? []),
        ];
        expect(Math.min(...multipliers)).toBeGreaterThanOrEqual(MIN_TIME_MULTIPLIER);
        expect(Math.max(...multipliers)).toBeLessThanOrEqual(MAX_TIME_MULTIPLIER);

        expect(playerGuessTimes.length).toBeGreaterThan(0);
        const guessTimes = playerGuessTimes.map(guess => guess.time);
        expect(Math.min(...guessTimes)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...guessTimes)).toBeLessThanOrEqual(totalTime);
        const participantIds = participants.map(participant => participant.id);
        for (const { playerId } of playerGuessTimes) {
          expect(participantIds).toContain(playerId);
        }
      });
    }
  });
});
