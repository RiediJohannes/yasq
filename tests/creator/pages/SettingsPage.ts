import { Locator, Page } from '@playwright/test';
import { CreatorPage } from './CreatorPage';

export class SettingsPage extends CreatorPage {
  readonly settingsForm: Locator;
  readonly roundsInput: Locator;
  readonly maxGuessTimeInput: Locator;
  readonly saveSettingsButton: Locator;
  readonly resetSettingsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.settingsForm = page.locator('form.creator-form');
    this.roundsInput = page.getByLabel('Rounds');
    this.maxGuessTimeInput = page.getByLabel('Max Guess Time (seconds)');
    this.saveSettingsButton = page.getByRole('button', { name: 'Save Settings' });
    this.resetSettingsButton = page.getByRole('button', { name: 'Reset to Defaults' });
  }
}
