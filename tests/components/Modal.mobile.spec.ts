import { expect, test } from '@playwright/test';
import { ModalComponent } from './Modal.object';

test.describe('Modal - Mobile', () => {
  test('should use the big close button by default on touch devices', async ({ mount }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.bigCloseBtn).toBeAttached();
    await expect(modal.bigCloseBtn).toBeVisible();
    await expect(modal.crossCloseBtn).not.toBeAttached();
    await expect(modal.crossCloseBtn).not.toBeVisible();
  });

  test('should call closing handler when tapping outside (backdrop)', async ({ mount, page }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await page.touchscreen.tap(10, 10);

    await expect(modal.dialog).not.toBeVisible();
    await expect(modal.closeCount).toHaveText('1');
  });

  test('should NOT close modal when tapping inside content', async ({ mount }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await modal.content.tap();

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');
  });
});
