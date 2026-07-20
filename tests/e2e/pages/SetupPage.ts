import { Page, Locator } from '@playwright/test';

export class SetupPage {
  readonly page: Page;
  readonly hostSettings: Locator;
  readonly roundsInput: Locator;
  readonly durationInput: Locator;
  readonly dropdown: Locator;
  readonly listContainer: Locator;
  readonly transferBtn: Locator;
  readonly waitingMsg: Locator;
  readonly firstJoker: Locator;
  readonly advancedToggle: Locator;
  readonly timeBonusSelect: Locator;
  readonly startBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.hostSettings = page.locator('#host-settings');
    this.roundsInput = page.locator('#rounds-input');
    this.durationInput = page.locator('#duration-input');
    this.dropdown = page.locator('#host-dropdown');
    this.listContainer = page.locator('#dropdown-list');
    this.transferBtn = page.locator('#btn-confirm-transfer');
    this.waitingMsg = page.locator('#waiting-setup-msg');
    this.firstJoker = page.locator('.joker-config-btn').first();
    this.advancedToggle = page.locator('#advanced-settings-btn');
    this.timeBonusSelect = page.locator('select');
    this.startBtn = page.locator('#btn-start');
  }

  getPlayerItem(id: string): Locator {
    return this.listContainer.locator(`.dropdown-item[data-id="${id}"]`);
  }

  async tabUntilFocused(locator: Locator) {
    while (!(await locator.evaluate((el) => el === document.activeElement))) {
      await this.page.keyboard.press('Tab');
    }
  }

  getFirstBonusInput(): Locator {
    return this.page.locator('input[name="first-bonus"]:checked');
  }
}