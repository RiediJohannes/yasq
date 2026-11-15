import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LobbyPage extends BasePage {
  readonly settingsSummary: Locator;
  readonly startBtn: Locator;
  readonly readyBtn: Locator;
  readonly editBtn: Locator;

  readonly roundsDisplay: Locator;
  readonly guessTimeDisplay: Locator;
  readonly jokersContainer: Locator;
  readonly timeBonusDisplay: Locator;
  readonly firstBonusDisplay: Locator;
  readonly streakBonusDisplay: Locator;
  readonly achievementModeDisplay: Locator;

  constructor(page: Page) {
    super(page);

    this.settingsSummary = this.content.locator('#settings-summary');
    this.startBtn = this.content.locator('#btn-start');
    this.readyBtn = this.content.locator('#btn-ready');
    this.editBtn = this.content.locator('#settings-edit-btn');

    this.roundsDisplay = this.content.locator('#settings-rounds');
    this.guessTimeDisplay = this.content.locator('#settings-guess-time');
    this.jokersContainer = this.content.locator('#settings-jokers');
    this.timeBonusDisplay = this.content.locator('#settings-time-bonus');
    this.firstBonusDisplay = this.content.locator('#settings-first-bonus');
    this.streakBonusDisplay = this.content.locator('#settings-streak-bonus');
    this.achievementModeDisplay = this.content.locator('#settings-achievements');
  }

  get enabledJokerItems(): Locator {
    return this.jokersContainer.locator('.joker-row-item');
  }

  async getEnabledJokerTypes(): Promise<string[]> {
    return this.enabledJokerItems.evaluateAll(elements => elements.map(el => el.dataset.jokerType!));
  }
}
