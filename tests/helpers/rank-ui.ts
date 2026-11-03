import type { Page } from '@playwright/test';
export async function openRankInput(page:Page,id=8201):Promise<void> {
  const editor=page.locator(`[data-progress-section="rank-input-${id}"]`);
  if(!await editor.evaluate(el=>(el as HTMLDetailsElement).open))await editor.locator(':scope > summary').click();
}
