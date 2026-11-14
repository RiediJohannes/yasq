import { Locator, Page } from '@playwright/test';
import { BaseModal } from './BaseModal';

export class GameSettingsModal extends BaseModal {
  readonly roundsDisplay: Locator;
  readonly guessTimeDisplay: Locator;
  readonly jokersContainer: Locator;
  readonly timeBonusDisplay: Locator;
  readonly firstBonusDisplay: Locator;
  readonly streakBonusDisplay: Locator;
  readonly achievementModeDisplay: Locator;

  constructor(page: Page) {
    super(page, '#game-settings-modal');

    this.roundsDisplay = this.modal.locator('#settings-rounds');
    this.guessTimeDisplay = this.modal.locator('#settings-guess-time');
    this.jokersContainer = this.modal.locator('#settings-jokers');
    this.timeBonusDisplay = this.modal.locator('#settings-time-bonus');
    this.firstBonusDisplay = this.modal.locator('#settings-first-bonus');
    this.streakBonusDisplay = this.modal.locator('#settings-streak-bonus');
    this.achievementModeDisplay = this.modal.locator('#settings-achievements');
  }

  get enabledJokerItems(): Locator {
    return this.jokersContainer.locator('.joker-row-item');
  }

  async getEnabledJokerTypes(): Promise<string[]> {
    return this.enabledJokerItems.evaluateAll(elements => elements.map(el => el.dataset.jokerType!));
  }
}
