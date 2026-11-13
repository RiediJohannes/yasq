import { JSHandle, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

type CountdownRecorder = { records: string[]; stop: () => void };

export class PlayingPage extends BasePage {
  // Player UI
  readonly guessInput: Locator;
  readonly submitBtn: Locator;
  readonly waitMessage: Locator;
  readonly resultsUI: Locator;
  readonly gameArena: Locator;
  readonly countdownOverlay: Locator;
  readonly countdownText: Locator;
  readonly countdownNumber: Locator;
  readonly jokerObfuscationBtn: Locator;
  readonly jokerTriviaBtn: Locator;
  readonly jokerMcBtn: Locator;
  readonly jokerSpyBtn: Locator;
  readonly hintText: Locator;
  readonly choiceButtons: Locator;
  readonly spyOverlay: Locator;
  readonly spyEmptyMsg: Locator;
  readonly spyActionButtons: Locator;
  readonly stolenResultBtn: Locator;

  // Host UI
  readonly hostUi: Locator;
  readonly summary: Locator;
  readonly tagsContainer: Locator;
  readonly tagBadges: Locator;

  private countdownRecorder?: JSHandle<CountdownRecorder>;

  constructor(page: Page) {
    super(page);

    // Player UI
    this.guessInput = this.content.locator('#guess-input');
    this.submitBtn = this.content.locator('#btn-submit');
    this.waitMessage = this.content.locator('#waiting-msg');
    this.resultsUI = this.content.locator('#results');
    this.gameArena = this.content.locator('#game-arena');
    this.countdownOverlay = this.content.locator('#countdown-overlay');
    this.countdownText = this.content.locator('#countdown-text');
    this.countdownNumber = this.content.locator('#countdown-number');
    this.jokerObfuscationBtn = this.content.locator('#btn-joker-obfuscation');
    this.jokerTriviaBtn = this.content.locator('#btn-joker-trivia');
    this.jokerMcBtn = this.content.locator('#btn-joker-multiple-choice');
    this.jokerSpyBtn = this.content.locator('#btn-joker-spy');
    this.hintText = this.content.locator('#obfuscation-hint-text');
    this.choiceButtons = this.content.locator('.choice-button');
    this.spyOverlay = this.content.locator('.hint-container:has-text("Pick a player to spy on")');
    this.spyEmptyMsg = this.spyOverlay.locator('.no-results');
    this.spyActionButtons = this.spyOverlay.locator('.spy-select-button');
    this.stolenResultBtn = this.content.locator('.choice-button');

    // Host UI
    this.hostUi = this.content.locator('#game-host-ui');
    this.summary = this.hostUi.locator('.card-container');
    this.tagsContainer = this.content.locator('.tags-container');
    this.tagBadges = this.content.locator('.tag-badge');
  }

  getTagBadge(text: string): Locator {
    return this.content.locator('.tag-badge', { hasText: text });
  }

  getSpyPlayerButton(username: string): Locator {
    return this.spyOverlay.locator('button').filter({ hasText: username });
  }

  /** Observe and record distinct values shown in #countdown-number. */
  async startRecordingCountdown(): Promise<void> {
    this.countdownRecorder = await this.content.evaluateHandle(() => {
      const records: string[] = [];

      const observer = new MutationObserver(() => {
        const text = document.querySelector('#countdown-number')?.textContent?.trim();
        if (text && records[records.length - 1] !== text) records.push(text);
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      return { records, stop: () => observer.disconnect() };
    });
  }

  async getRecordedCountdown(): Promise<string[]> {
    if (!this.countdownRecorder) throw new Error('Call startRecordingCountdown() first');
    return this.countdownRecorder.evaluate(r => [...r.records]);
  }

  async stopRecordingCountdown(): Promise<void> {
    await this.countdownRecorder?.evaluate(r => r.stop());
    await this.countdownRecorder?.dispose();
    this.countdownRecorder = undefined;
  }
}
