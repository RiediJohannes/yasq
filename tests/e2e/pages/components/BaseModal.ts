import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

export abstract class BaseModal extends BaseComponent {
  readonly modal: Locator;
  readonly title: Locator;
  readonly closeBtn: Locator;

  protected constructor(page: Page, componentSelector: string) {
    super(page, componentSelector);

    this.modal = this.component;
    this.title = this.modal.locator(`.modal-title`).first();
    this.closeBtn = this.modal.locator('button[data-action="close"]');
  }
}
