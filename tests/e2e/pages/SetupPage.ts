import { Locator, Page } from '@playwright/test';
import { AchievementBonusMode, FirstBonusMultiplier, Joker, StreakBonusMultiplier, TimeBonus } from '@yasq/shared';
import { BasePage } from './BasePage';

export class SetupPage extends BasePage {
  readonly hostSettings: Locator;
  readonly advancedSettings: Locator;

  readonly roundsInput: Locator;
  readonly maxGuessTimeInput: Locator;
  readonly firstJoker: Locator;

  readonly advancedSettingsToggle: Locator;
  readonly timeBonusSelect: Locator;
  readonly timeBonusPlot: Locator;
  readonly firstBonusGroup: Locator;
  readonly streakBonusGroup: Locator;
  readonly achievementModeRadioGroup: Locator;
  readonly achievementChecklist: Locator;
  readonly achievementRandomInput: Locator;

  readonly hostTransferDropdownBtn: Locator;
  readonly hostTransferList: Locator;
  readonly hostTransferConfirmBtn: Locator;

  readonly startBtn: Locator;
  readonly waitingMsg: Locator;

  constructor(page: Page) {
    super(page);

    this.hostSettings = page.locator('#host-settings');
    this.advancedSettings = page.locator('#advanced-settings');

    this.roundsInput = page.locator('#rounds-input');
    this.maxGuessTimeInput = page.locator('#guess-time-input');
    this.firstJoker = page.locator('.joker-config-btn').first();

    this.advancedSettingsToggle = page.locator('#advanced-settings-btn');
    this.timeBonusSelect = page.locator('#time-bonus-select');
    this.timeBonusPlot = page.locator('.time-bonus-plot');
    this.firstBonusGroup = page.locator('#first-bonus-group');
    this.streakBonusGroup = page.locator('#streak-bonus-group');
    this.achievementModeRadioGroup = page.locator('#achievement-mode-group');
    this.achievementChecklist = page.locator('.achievement-checklist');
    this.achievementRandomInput = page.locator('.achievement-settings input[type="number"]');

    this.hostTransferDropdownBtn = page.locator('#host-transfer-dropdown .dropdown-header');
    this.hostTransferList = page.locator('#dropdown-list');
    this.hostTransferConfirmBtn = page.locator('#btn-confirm-transfer');

    this.startBtn = page.locator('#btn-start');
    this.waitingMsg = page.locator('#waiting-setup-msg');
  }

  async tabUntilFocused(locator: Locator) {
    while (!(await locator.evaluate(el => el === document.activeElement))) {
      await this.page.keyboard.press('Tab');
    }
  }

  getPlayerItem(id: string): Locator {
    return this.hostTransferList.locator(`.dropdown-item[data-id="${id}"]`);
  }

  async getActiveTimeBonus(): Promise<string> {
    return this.timeBonusSelect.inputValue();
  }

  async setTimeBonus(bonus: TimeBonus | '❌ No time bonus') {
    await this.timeBonusSelect.selectOption(bonus.toString());
  }

  getActiveFirstBonus(): Promise<string> {
    return this.page.locator('input[name="first-bonus"]:checked').first().inputValue();
  }

  getFirstBonusOptionAt(index: number): Locator {
    return this.firstBonusGroup.locator('label').nth(index);
  }

  async setFirstBonus(bonus: FirstBonusMultiplier): Promise<void> {
    await this.firstBonusGroup.locator(`label[for="first-bonus-${bonus}"]`).click();
  }

  getActiveStreakBonus(): Promise<string> {
    return this.page.locator('input[name="streak-bonus"]:checked').first().inputValue();
  }

  getStreakBonusOptionAt(index: number): Locator {
    return this.streakBonusGroup.locator('label').nth(index);
  }

  async setStreakBonus(bonus: StreakBonusMultiplier): Promise<void> {
    await this.streakBonusGroup.locator(`label[for="streak-bonus-${bonus}"]`).click();
  }

  getActiveAchievementMode(): Promise<string> {
    return this.page.locator('input[name="achievement-mode"]:checked').inputValue();
  }

  async setAchievementMode(mode: AchievementBonusMode | 'off'): Promise<void> {
    await this.achievementModeRadioGroup.locator(`label[for="achievement-mode-${mode}"]`).click();
  }

  getFirstAchievementCheckbox(): Locator {
    return this.achievementChecklist.locator('input[type="checkbox"]').first();
  }

  async toggleAchievementType(type: string): Promise<void> {
    await this.achievementChecklist.locator(`label:has-text("${type}") input`).click();
  }

  async getAllJokerButtons(): Promise<Locator[]> {
    return this.page.locator('.joker-config-btn').all();
  }

  async getEnabledJokerButtons(): Promise<Locator[]> {
    return this.page.locator('.joker-config-btn.active').all();
  }

  async getEnabledJokerTypes(): Promise<string[]> {
    const jokerButtons = await this.getEnabledJokerButtons();
    return Promise.all(
      jokerButtons.map(locator =>
        locator.evaluate(button => button.id.replace('config-', '').replace(/-/g, '_').toUpperCase())
      )
    );
  }

  async setEnabledJokers(targetJokers: Set<Joker> | Joker[]): Promise<void> {
    const targetSet = new Set(targetJokers);
    const jokerButtons = await this.getAllJokerButtons();

    for (const locator of jokerButtons) {
      const id = await locator.getAttribute('id');

      const jokerType = id!.replace('config-', '').replace(/-/g, '_').toUpperCase() as Joker;

      const isActive = await locator.evaluate(el => el.classList.contains('active'));
      const shouldBeActive = targetSet.has(jokerType);

      if (isActive !== shouldBeActive) {
        await locator.click();
      }
    }
  }
}
