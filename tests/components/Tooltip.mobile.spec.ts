import { test } from '@playwright/test';
import { expect } from './Tooltip.assertions';
import { LONG_PRESS_MILLIS } from '@yasq/shared';

test.describe('Tooltip - Mobile', () => {
  test('should toggle tooltip instantly on tap for non-interactive children', async ({ page, mount }) => {
    await mount('Tooltip/WrapBasicChild');
    const child = page.locator('#test-tooltip');

    await expect(child).not.toHaveActiveTooltip();
    await child.tap();
    await expect(child).toHaveActiveTooltip();
    await child.tap();
    await expect(child).not.toHaveActiveTooltip();
  });

  test('should close active tooltip when tapping elsewhere in the window', async ({ page, mount }) => {
    await mount('Tooltip/WrapBasicChild');
    const child = page.locator('#test-tooltip');

    await child.tap();
    await expect(child).toHaveActiveTooltip();

    await page.locator('body').tap({ position: { x: 0, y: 0 } });
    await expect(child).not.toHaveActiveTooltip();
  });

  test('should trigger onClick handler of interactive children but NOT open the tooltip for fast taps', async ({
    page,
    mount,
  }) => {
    await mount('Tooltip/WrapInteractiveChild');
    const button = page.locator('#tooltip-child');
    const count = page.locator('#click-count');

    await expect(button).not.toHaveActiveTooltip();
    await expect(count).toHaveText('0');

    await button.tap();

    await expect(button).not.toHaveActiveTooltip();
    await expect(count).toHaveText('1'); // onClick was preserved
  });

  test('should NOT trigger onClick handler of interactive children but open the tooltip for long-presses', async ({
    page,
    mount,
  }) => {
    await mount('Tooltip/WrapInteractiveChild');
    const button = page.locator('#tooltip-child');
    const count = page.locator('#click-count');

    await expect(button).not.toHaveActiveTooltip();
    await expect(count).toHaveText('0');

    // Simulate long-press
    await button.dispatchEvent('touchstart');
    await page.waitForTimeout(LONG_PRESS_MILLIS + 50);
    await button.dispatchEvent('touchend');

    // Tooltip was opened and onClick event was swallowed
    await expect(button).toHaveActiveTooltip();
    await expect(count).toHaveText('0');
  });

  test('should not violate closing rules or exclusivity condition after long-press', async ({ page, mount }) => {
    await mount('Tooltip/MultipleTooltips');

    const shortTapChild = page.locator('#tooltip-2'); // Non-interactive child (instant tap)
    const longTapChild = page.locator('#tooltip-3'); // Button with onClick (long-press required)

    await expect(shortTapChild).not.toHaveActiveTooltip();
    await expect(longTapChild).not.toHaveActiveTooltip();

    // Open first one via standard tap
    await shortTapChild.tap();
    await expect(shortTapChild).toHaveActiveTooltip();

    // Open second one via long-press
    await longTapChild.dispatchEvent('touchstart');
    await page.waitForTimeout(LONG_PRESS_MILLIS + 50);
    await longTapChild.dispatchEvent('touchend');

    // Ensure exclusivity was enforced
    await expect(longTapChild).toHaveActiveTooltip();
    await expect(shortTapChild).not.toHaveActiveTooltip();

    // Tapping outside closes the long-tap tooltip like a normal one
    await page.locator('body').tap({ position: { x: 0, y: 0 } });
    await expect(longTapChild).not.toHaveActiveTooltip();
  });

  test('should cancel deferred tooltip if long-press moves away (swipe to cancel)', async ({ page, mount }) => {
    await mount('Tooltip/WrapInteractiveChild');
    const button = page.locator('#tooltip-child');

    await expect(button).not.toHaveActiveTooltip();

    await button.dispatchEvent('touchstart');
    await page.waitForTimeout(LONG_PRESS_MILLIS / 2);
    await button.dispatchEvent('touchmove');
    await page.waitForTimeout(LONG_PRESS_MILLIS / 1.5);
    await button.dispatchEvent('touchend');

    await expect(button).not.toHaveActiveTooltip();
  });

  test('should cancel deferred tooltip if long-press is aborted by the OS (e.g. switching applications)', async ({
    page,
    mount,
  }) => {
    await mount('Tooltip/WrapInteractiveChild');
    const button = page.locator('#tooltip-child');

    await expect(button).not.toHaveActiveTooltip();

    await button.dispatchEvent('touchstart');
    await page.waitForTimeout(LONG_PRESS_MILLIS / 2);
    await button.dispatchEvent('touchcancel');

    await expect(button).not.toHaveActiveTooltip();
  });
});
