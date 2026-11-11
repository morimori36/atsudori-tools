import type { Locator, Page } from '@playwright/test';

/** Exercise the visible menu trigger on mobile before choosing a destination. */
export async function chooseScreen(page: Page, destination: Locator): Promise<void> {
  const trigger = page.locator('[data-menu-open]');
  if (await trigger.isVisible() && !(await page.locator('[data-navigation-dialog]').evaluate((dialog: HTMLDialogElement) => dialog.open))) {
    await trigger.click();
  }
  await destination.click();
}
