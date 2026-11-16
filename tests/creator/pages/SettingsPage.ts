import { Locator, Page } from '@playwright/test';
import { CreatorPage } from './CreatorPage';

export class SettingsPage extends CreatorPage {
  readonly settingsForm: Locator;
  readonly roundsInput: Locator;
  readonly maxGuessTimeInput: Locator;
  readonly saveSettingsButton: Locator;
  readonly resetSettingsButton: Locator;
  readonly achievementRuleNameInput: Locator;
  readonly addCustomAchievementToggle: Locator;
  readonly achievementRuleMetricSelect: Locator;
  readonly achievementRuleFilterSelect: Locator;
  readonly achievementRuleAggregateSelect: Locator;
  readonly achievementRuleGoalSelect: Locator;
  readonly achievementRuleRewardInput: Locator;
  readonly addAchievementBonusButton: Locator;
  readonly achievementBonuses: Locator;
  readonly restoreDefaultBonusesButton: Locator;

  constructor(page: Page) {
    super(page);
    this.settingsForm = page.locator('form.creator-form');
    this.roundsInput = page.getByLabel('Rounds');
    this.maxGuessTimeInput = page.getByLabel('Max Guess Time (seconds)');
    this.saveSettingsButton = page.getByRole('button', { name: 'Save Settings' });
    this.resetSettingsButton = page.getByRole('button', { name: 'Reset to Defaults' });
    this.achievementRuleNameInput = page.getByLabel('Name', { exact: true });
    this.addCustomAchievementToggle = page.getByRole('button', { name: 'Add custom achievement bonus' });
    this.achievementRuleMetricSelect = page.getByLabel('Metric');
    this.achievementRuleFilterSelect = page.getByLabel('Filter');
    this.achievementRuleAggregateSelect = page.getByLabel('Aggregate');
    this.achievementRuleGoalSelect = page.getByLabel('Goal');
    this.achievementRuleRewardInput = page.getByLabel('Reward');
    this.addAchievementBonusButton = page.getByRole('button', { name: 'Add Achievement Bonus' });
    this.achievementBonuses = page.getByRole('list', { name: 'Achievement bonuses' });
    this.restoreDefaultBonusesButton = page.getByRole('button', { name: 'Restore Default Bonuses' });
  }

  removeAchievementBonusButton(name: string) {
    return this.page.getByRole('button', { name: `Remove ${name}` });
  }

  achievementBonusCheckbox(name: string) {
    return this.page.locator('.tag-checkboxes-list label').filter({ hasText: name }).locator('input[type="checkbox"]');
  }
}
