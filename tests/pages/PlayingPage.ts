import { Page, Locator } from '@playwright/test';

export class PlayingPage {
  readonly page: Page;

  // Player UI
  readonly guessInput: Locator;
  readonly submitBtn: Locator;
  readonly waitMessage: Locator;
  readonly resultsUI: Locator;
  readonly gameArena: Locator;
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

  constructor(page: Page) {
    this.page = page;

    // Player UI
    this.guessInput = page.locator('#guess-input');
    this.submitBtn = page.locator('#btn-submit');
    this.waitMessage = page.locator('#waiting-msg');
    this.resultsUI = page.locator('#results');
    this.gameArena = page.locator('#game-arena');
    this.jokerObfuscationBtn = page.locator('#btn-joker-obfuscation');
    this.jokerTriviaBtn = page.locator('#btn-joker-trivia');
    this.jokerMcBtn = page.locator('#btn-joker-multiple-choice');
    this.jokerSpyBtn = page.locator('#btn-joker-spy');
    this.hintText = page.locator('#obfuscation-hint-text');
    this.choiceButtons = page.locator('.choice-button');
    this.spyOverlay = page.locator('.hint-container:has-text("Pick a player to spy on")');
    this.spyEmptyMsg = this.spyOverlay.locator('.no-results');
    this.spyActionButtons = this.spyOverlay.locator('.spy-select-button');
    this.stolenResultBtn = page.locator('.choice-button');

    // Host UI
    this.hostUi = page.locator('#game-host-ui');
    this.summary = this.hostUi.locator('.card-container');
    this.tagsContainer = page.locator('.tags-container');
    this.tagBadges = page.locator('.tag-badge');
  }

  getTagBadge(text: string): Locator {
    return this.page.locator('.tag-badge', { hasText: text });
  }

  getSpyPlayerButton(username: string): Locator {
    return this.spyOverlay.locator('button').filter({ hasText: username });
  }
}