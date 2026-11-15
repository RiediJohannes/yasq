import type { Result } from 'axe-core';
import { Page } from '@playwright/test';

export async function highlightAccessibilityViolations(page: Page, violations: Result[]) {
  if (violations.length === 0) return;

  await page.evaluate(vList => {
    for (const violation of vList) {
      for (const node of violation.nodes) {
        for (const selector of node.target) {
          const el = document.querySelector(selector as string);
          if (el) {
            const htmlEl = el as HTMLElement;
            htmlEl.style.outline = '4px solid red';
            htmlEl.style.outlineOffset = '2px';
            htmlEl.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            htmlEl.style.zIndex = '999999';
            htmlEl.style.overflow = 'visible';

            let parent = htmlEl.parentElement;
            while (parent && parent !== document.body) {
              const parentOverflow = window.getComputedStyle(parent).overflow;
              if (parentOverflow === 'hidden' || parentOverflow === 'scroll' || parentOverflow === 'auto') {
                parent.style.overflow = 'visible';
              }
              parent = parent.parentElement;
            }
          }
        }
      }
    }
  }, violations);
}

export function formatViolations(violations: Result[]) {
  return violations
    .map(
      v =>
        `\n• [${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
        v.nodes.map(node => `    Target: ${node.target.join(' > ')}\n    HTML: ${node.html}`).join('\n')
    )
    .join('\n');
}
