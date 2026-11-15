import { Locator, Page } from '@playwright/test';
import { expect } from 'playwright/test';
import { BaseModal } from './BaseModal';

export class HowToPlayModal extends BaseModal {
  readonly hostTabLabel: Locator;
  readonly playerTabLabel: Locator;
  readonly tabContent: Locator;

  constructor(page: Page) {
    super(page, '#how-to-play-modal');

    this.hostTabLabel = this.component.locator('label[for="how-to-play-view-host"]');
    this.playerTabLabel = this.component.locator('label[for="how-to-play-view-player"]');
    this.tabContent = this.component.locator('.instructions-tab-content');
  }

  async openHostTab() {
    await this.hostTabLabel.click();
  }

  async openPlayerTab() {
    await this.playerTabLabel.click();
  }

  async expectTabToBeOpen(tab: 'player' | 'host') {
    expect(this.tabContent).toBeDefined();
    await expect(this.tabContent).toBeVisible();
    await expect(this.tabContent).toHaveAttribute('data-active-tab', tab);

    const theOtherTab = tab === 'player' ? 'host' : 'player';
    await expect(this.tabContent).not.toHaveAttribute('data-active-tab', theOtherTab);
  }
}
