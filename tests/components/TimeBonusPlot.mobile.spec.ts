import { test } from '@playwright/test';
import { expect } from './TimeBonusPlot.assertions';
import { TimeBonusPlotComponent } from './TimeBonusPlot.object';

test.describe('TimeBonusPlot - Mobile', () => {
  // Requires Chrome DevTools Protocol to simulate more complex touch events than a simple "tap"
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Complex touches are simulated via the Chrome DevTools Protocol'
  );

  test('should show the player tooltip while a finger rests on a marker and hide it on release', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);
    const [firstMarkerX] = await plot.getMarkerPlotXs();

    await plot.touchStart(await plot.clientPointAtPlotX(firstMarkerX));

    await expect(plot).toHavePlayerTooltip(guesses[0]);
    await expect(plot.hoveredMarkers).toHaveCount(1);

    await plot.touchEnd();

    await expect(plot).toHaveNoTooltip();
  });

  test('should follow a finger that is dragged horizontally across the plot', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);
    const last = guesses[guesses.length - 1];
    const markerXs = await plot.getMarkerPlotXs();
    const start = await plot.clientPointAtPlotX(markerXs[0]);
    const end = await plot.clientPointAtPlotX(markerXs[last.index]);

    await plot.touchStart(start);
    await expect(plot).toHavePlayerTooltip(guesses[0]);

    await plot.touchMove({ x: end.x, y: start.y });

    await expect(plot).toHavePlayerTooltip(last);
    await expect(plot.hoveredMarkers).toHaveCount(1);
  });

  test('should release the plot when the gesture turns out to be a vertical scroll', async ({ mount }) => {
    const { plot, guesses } = await TimeBonusPlotComponent.create(mount);
    const [firstMarkerX] = await plot.getMarkerPlotXs();
    const start = await plot.clientPointAtPlotX(firstMarkerX);

    await plot.touchStart(start);
    await expect(plot).toHavePlayerTooltip(guesses[0]);

    await plot.touchMove({ x: start.x + 4, y: start.y + 40 });

    await expect(plot).toHaveNoTooltip();
  });
});
