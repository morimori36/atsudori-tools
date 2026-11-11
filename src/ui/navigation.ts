/** Hash routes keep direct links under the static Pages base path. */
export const navigationGroups = [
  { label: '評価・計算', tabs: [['rating', '評価値'], ['event', 'イベント周回'], ['economy', '素材別充足日数'], ['star-budget', 'スター予算'], ['manual', '表示値で計算']] },
  { label: '所持・育成', tabs: [['members', 'メンバー'], ['snaps', 'スナップ'], ['stamps', 'スタンプ'], ['inventory', '素材在庫'], ['materials', '必要素材'], ['progress', 'キャラランク'], ['items', 'バンドアイテム']] },
  { label: 'データ管理', tabs: [['exchange', 'JSON Import / Export']] },
] as const;
export type Tab = typeof navigationGroups[number]['tabs'][number][0];
export function routeFromHash(hash: string): Tab {
  const id = hash.slice(1);
  return navigationGroups.flatMap(group => [...group.tabs]).find(([tab]) => tab === id)?.[0] ?? 'rating';
}

/** One navigation tree: desktop sidebar or a native modal on small screens. */
export function bindNavigation(root: HTMLElement, navigate: (tab: Tab) => void, signal: AbortSignal): void {
  const nav = root.querySelector<HTMLElement>('.navigation')!;
  const trigger = root.querySelector<HTMLButtonElement>('[data-menu-open]')!;
  const dialog = root.querySelector<HTMLDialogElement>('[data-navigation-dialog]')!;
  const slot = nav.parentNode!;
  const close = (): void => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => {
    slot.insertBefore(nav, slot.firstChild);
    trigger.setAttribute('aria-expanded', 'false');
    const target = matchMedia('(max-width: 700px)').matches ? trigger : nav.querySelector<HTMLElement>('[aria-current]');
    target?.focus({ preventScroll: true });
  });
  trigger.addEventListener('click', () => {
    dialog.append(nav);
    trigger.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-menu-close]')!.focus();
  });
  dialog.querySelector('[data-menu-close]')!.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
    const first = controls[0]!, last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const media = matchMedia('(max-width: 700px)');
  media.addEventListener('change', () => { if (!media.matches) close(); }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => {
    // Restore the navigation before render removes the modal and its focus target.
    close();
    slot.insertBefore(nav, slot.firstChild);
    navigate(button.dataset.tab as Tab);
  }));
}
