import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

export abstract class BaseModal extends BaseComponent {
  readonly modal: Locator;
  readonly closeBtn: Locator;

  protected constructor(page: Page, componentSelector: string) {
    super(page, componentSelector);

    this.modal = this.component;
    this.closeBtn = this.modal.locator('button[data-action="close"]');
  }
}
