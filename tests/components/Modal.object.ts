import { Locator } from '@playwright/test';

export class ModalComponent {
  readonly component: Locator;

  readonly dialog: Locator;
  readonly header: Locator;
  readonly title: Locator;
  readonly content: Locator;
  readonly openBtn: Locator;
  readonly innerBtn: Locator;
  readonly closeCount: Locator;
  readonly crossCloseBtn: Locator;
  readonly bigCloseBtn: Locator;

  constructor(component: Locator) {
    this.component = component;

    this.dialog = component.locator('.modal-dialog');
    this.header = component.locator('.modal-header');
    this.title = component.locator('.modal-title');
    this.content = component.locator('#modal-content');
    this.openBtn = component.locator('#open-btn');
    this.innerBtn = component.locator('#inner-btn');
    this.closeCount = component.locator('#close-count');
    this.crossCloseBtn = component.locator('.modal-close-cross');
    this.bigCloseBtn = component.locator('.modal-close-btn');
  }
}
