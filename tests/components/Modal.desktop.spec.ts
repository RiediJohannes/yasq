import { expect, test } from '@playwright/test';
import { ModalComponent } from './Modal.object';

test.describe('Modal - General', () => {
  test('should show modal and lock/unlock body scrolling on (external) state toggle', async ({ mount, page }) => {
    const component = await mount('Modal/BasicClosed');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).not.toBeVisible();

    await modal.openBtn.click();

    await expect(modal.dialog).toBeVisible();
    await expect(modal.header).toBeVisible();
    await expect(modal.title).toHaveText('Custom Title');
    await expect(modal.content).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Toggling the state through an external event also closes modal and restores scrolling
    await modal.innerBtn.click();

    await expect(modal.dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('should call closing handler when clicking top-right cross icon', async ({ mount }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await modal.crossCloseBtn.click();

    await expect(modal.dialog).not.toBeVisible();
    await expect(modal.closeCount).toHaveText('1');
  });

  test('should call closing handler when clicking large bottom close button', async ({ mount }) => {
    const component = await mount('Modal/BigCloseButtonOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await modal.bigCloseBtn.click();

    await expect(modal.dialog).not.toBeVisible();
    await expect(modal.closeCount).toHaveText('1');
  });

  test('should call closing handler when pressing Escape key', async ({ mount, page }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await page.keyboard.press('Escape');

    await expect(modal.dialog).not.toBeVisible();
    await expect(modal.closeCount).toHaveText('1');
  });

  test('should call closing handler when clicking outside (backdrop)', async ({ mount, page }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await page.mouse.click(10, 10);

    await expect(modal.dialog).not.toBeVisible();
    await expect(modal.closeCount).toHaveText('1');
  });

  test('should NOT close modal when clicking inside content', async ({ mount }) => {
    const component = await mount('Modal/BasicOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');

    await modal.content.click();

    await expect(modal.dialog).toBeVisible();
    await expect(modal.closeCount).toHaveText('0');
  });

  test('should use cross close button by default but allow opting for the big close button', async ({ mount }) => {
    const componentDefault = await mount('Modal/BasicOpen');
    const modalDefault = new ModalComponent(componentDefault);

    await expect(modalDefault.dialog).toBeVisible();
    await expect(modalDefault.crossCloseBtn).toBeAttached();
    await expect(modalDefault.crossCloseBtn).toBeVisible();
    await expect(modalDefault.bigCloseBtn).not.toBeVisible();
    await expect(modalDefault.bigCloseBtn).not.toBeAttached();

    const componentBigButton = await mount('Modal/BigCloseButtonOpen');
    const modalBigButton = new ModalComponent(componentBigButton);

    await expect(modalBigButton.dialog).toBeVisible();
    await expect(modalBigButton.crossCloseBtn).not.toBeAttached();
    await expect(modalBigButton.crossCloseBtn).not.toBeVisible();
    await expect(modalBigButton.bigCloseBtn).toBeVisible();
    await expect(modalBigButton.bigCloseBtn).toBeAttached();
  });

  test('should completely omit the dialog header if no title is set', async ({ mount }) => {
    const component = await mount('Modal/NoTitleOpen');
    const modal = new ModalComponent(component);

    await expect(modal.dialog).toBeVisible();

    await expect(modal.header).not.toBeVisible();
    await expect(modal.header).not.toBeAttached();
    await expect(modal.crossCloseBtn).not.toBeVisible();
    await expect(modal.crossCloseBtn).not.toBeAttached();

    await expect(modal.bigCloseBtn).toBeAttached();
    await expect(modal.bigCloseBtn).toBeVisible();
  });
});
