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

  constructor(page: Page) {
    super(page);

    this.settingsSummary = page.locator('#settings-summary');
    this.startBtn = page.locator('#btn-start');
    this.readyBtn = page.locator('#btn-ready');
    this.editBtn = page.locator('button[title="Edit Game Settings"]');

    this.roundsDisplay = page.locator('#settings-rounds');
    this.guessTimeDisplay = page.locator('#settings-guess-time');
    this.jokersContainer = page.locator('#settings-jokers');
    this.timeBonusDisplay = page.locator('#settings-time-bonus');
    this.firstBonusDisplay = page.locator('#settings-first-bonus');
    this.streakBonusDisplay = page.locator('#settings-streak-bonus');
  }

  get enabledJokerItems(): Locator {
    return this.jokersContainer.locator('.joker-row-item');
  }

  async getEnabledJokerTypes(): Promise<string[]> {
    return this.enabledJokerItems.evaluateAll(elements => elements.map(el => el.dataset.jokerType!));
  }
}
