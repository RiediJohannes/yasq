import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

export class Header extends BaseComponent {
  readonly header: Locator;
  readonly title: Locator;
  readonly gameSettingsBtn: Locator;
  readonly howToPlayBtn: Locator;
  readonly localSettingsBtn: Locator;

  constructor(page: Page) {
    super(page, '#game-header');

    this.header = this.component.locator('header');
    this.title = this.component.locator('#header-title');
    this.gameSettingsBtn = this.component.locator('#game-settings-btn');
    this.howToPlayBtn = this.component.locator('#how-to-play-btn');
    this.localSettingsBtn = this.component.locator('#local-settings-btn');
  }
}
