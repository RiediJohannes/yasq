import { test } from '@playwright/test';
import { expect } from './Tooltip.assertions';

test.describe('Tooltip - General', () => {
  test.describe('WithTooltip', () => {
    test('should NOT introduce an additional DOM element but apply tooltip text', async ({ mount }) => {
      const component = await mount('Tooltip/WrapBasicChild');
      const parent = component.locator('#direct-parent');

      // WithTooltip did not wrap the child in an extra container
      const allChildren = parent.locator('>*');
      await expect(allChildren).toHaveCount(1);
      const child = allChildren.first();
      await expect(child).toHaveId('test-tooltip');

      await expect(child).toHaveTooltip('Helpful information');
    });

    test('should only pass down tooltip ID to wrapped children with no prior ID', async ({ mount }) => {
      // Child in WrapBasicChild scenario had no ID of its own
      const unnamedChildComponent = await mount('Tooltip/WrapBasicChild');
      let tooltipIdElement = unnamedChildComponent.locator('#test-tooltip');

      await expect(tooltipIdElement).toBeAttached();

      // Child in WrapInteractiveChild scenario already had an ID ("tooltip-child")
      const namedChildComponent = await mount('Tooltip/WrapInteractiveChild');
      const namedChild = namedChildComponent.locator('#tooltip-child');
      tooltipIdElement = namedChildComponent.locator('#test-tooltip');

      await expect(namedChild).toBeAttached();
      await expect(tooltipIdElement).not.toBeAttached();
    });
  });

  test.describe('TooltipDiv', () => {
    test('should wrap raw text in a div and apply tooltip text', async ({ mount }) => {
      const component = await mount('Tooltip/DivAroundText');
      const parent = component.locator('#direct-parent');

      // TooltipDiv became a <div> and direct child of #direct-parent
      const parentChildren = parent.locator('>*');
      await expect(parentChildren).toHaveCount(1);
      const directChild = parentChildren.first();
      await expect(directChild).toHaveId('test-tooltip');
      await expect(directChild).toHaveJSProperty('tagName', 'DIV');
      await expect(directChild).toHaveTooltip('Helpful information');

      // TooltipDiv only contains raw text, no complex nodes
      const tooltipDivChildren = directChild.locator('>*');
      await expect(tooltipDivChildren).toHaveCount(0);
      await expect(directChild).toContainText('Hover or focus me');

      // Tooltip activation works on text
      await directChild.hover();
      await expect(directChild).toHaveActiveTooltip();
    });

    test('should wrap complex hierarchy in a div and apply tooltip text', async ({ mount, page }) => {
      const component = await mount('Tooltip/DivAroundHierarchy');
      const parent = component.locator('#direct-parent');

      // TooltipDiv became a <div> and direct child of #direct-parent
      const parentChildren = parent.locator('>*');
      await expect(parentChildren).toHaveCount(1);
      const directChild = parentChildren.first();
      await expect(directChild).toHaveId('test-tooltip');
      await expect(directChild).toHaveJSProperty('tagName', 'DIV');
      await expect(directChild).toHaveTooltip('Helpful information');

      const tooltipDiv = directChild;

      // TooltipDiv contains exactly the expected hierarchy, and all of them trigger the tooltip activation
      const tooltipDivChildren = tooltipDiv.locator('>*');
      await expect(tooltipDivChildren).toHaveCount(2);
      await expect(tooltipDivChildren.nth(0)).toHaveId('tooltip-child-1');
      await expect(tooltipDivChildren.nth(1)).toHaveId('tooltip-child-2');

      const expectedChildren = ['#tooltip-child-1', '#tooltip-child-1 #nested-button', '#tooltip-child-2'];
      for (const expectedChild of expectedChildren) {
        const actualChild = tooltipDiv.locator(expectedChild);
        await expect(actualChild).toBeAttached();

        await page.mouse.move(0, 0);
        await expect(tooltipDiv).not.toHaveActiveTooltip();

        await actualChild.hover();
        await expect(tooltipDiv).toHaveActiveTooltip();
      }
    });
  });

  test('should center tooltip arrow at child element but keep tooltip body within screen boundaries', async ({
    mount,
  }) => {
    const component = await mount('Tooltip/BoundaryTest');
    const elementIds = ['tooltip-left', 'tooltip-right'];
    for (const elementId of elementIds) {
      const element = component.locator(`#${elementId}`);
      await element.hover();

      await expect(element).toHaveActiveTooltip();
      await expect(element).toHaveCenteredTooltipArrow();
      await expect(element).toKeepTooltipWithinViewportBounds();
    }
  });

  test('should enforce exclusivity (only one active tooltip at a time)', async ({ mount }) => {
    const component = await mount('Tooltip/MultipleTooltips');
    const firstChild = component.locator('#tooltip-1');
    const secondChild = component.locator('#tooltip-2');

    await expect(firstChild).not.toHaveActiveTooltip();
    await expect(secondChild).not.toHaveActiveTooltip();

    await firstChild.hover();
    await expect(firstChild).toHaveActiveTooltip();
    await expect(secondChild).not.toHaveActiveTooltip();

    await secondChild.hover();
    await expect(firstChild).not.toHaveActiveTooltip();
    await expect(secondChild).toHaveActiveTooltip();

    await firstChild.focus();
    await expect(firstChild).toHaveActiveTooltip();
    await expect(secondChild).not.toHaveActiveTooltip();
  });

  test('should preserve onClick handler of an interactive child AND close tooltip on click', async ({ mount }) => {
    const component = await mount('Tooltip/WrapInteractiveChild');
    const button = component.locator('#tooltip-child');
    const count = component.locator('#click-count');

    await expect(button).not.toHaveActiveTooltip();
    await expect(count).toHaveText('0');

    await button.hover();
    await expect(button).toHaveActiveTooltip();
    await expect(count).toHaveText('0');

    await button.click();
    await expect(count).toHaveText('1'); // click was registered
    await expect(button).not.toHaveActiveTooltip();
  });
});

test.describe('Tooltip - Desktop', () => {
  test('should show tooltip on hover and hide it when the mouse leaves', async ({ mount, page }) => {
    const component = await mount('Tooltip/WrapBasicChild');
    const child = component.locator('#test-tooltip');

    await expect(child).not.toHaveActiveTooltip();

    await child.hover();
    await expect(child).toHaveActiveTooltip();

    await page.mouse.move(0, 0);
    await expect(child).not.toHaveActiveTooltip();
  });

  test('should maintain focusability + tab order, and shift tooltip accordingly', async ({ mount, page }) => {
    await mount('Tooltip/MultipleTooltips');

    const child1 = page.locator('#tooltip-1');
    const child2 = page.locator('#tooltip-2');
    const child3 = page.locator('#tooltip-3');

    await expect(child1).not.toHaveActiveTooltip();
    await expect(child2).not.toHaveActiveTooltip();
    await expect(child3).not.toHaveActiveTooltip();

    // Focus lands on first element -> Tooltip 1 opens
    await page.keyboard.press('Tab');
    await expect(child1).toBeFocused();
    await expect(child1).toHaveActiveTooltip();
    await expect(child2).not.toHaveActiveTooltip();

    // Focus shifts to second element -> Tooltip 1 closes, Tooltip 2 opens
    await page.keyboard.press('Tab');
    await expect(child2).toBeFocused();
    await expect(child1).not.toHaveActiveTooltip();
    await expect(child2).toHaveActiveTooltip();

    // Focus shifts to third element
    await page.keyboard.press('Tab');
    await expect(child3).toBeFocused();
    await expect(child2).not.toHaveActiveTooltip();
    await expect(child3).toHaveActiveTooltip();

    // Focus leaves children entirely
    await child3.blur();
    await expect(child3).not.toHaveActiveTooltip();
    await expect(child1).not.toHaveActiveTooltip();
    await expect(child2).not.toHaveActiveTooltip();
  });

  test('should have no effect on the DOM when tooltip functionality is disabled', async ({ mount }) => {
    const component = await mount('Tooltip/Disabled');
    const child = component.locator('#disabled-tooltip');

    await expect(child).not.toHaveTooltip();

    await child.hover();
    await expect(child).not.toHaveTooltip();

    await child.focus();
    await expect(child).not.toHaveTooltip();
  });
});
