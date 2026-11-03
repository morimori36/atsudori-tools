import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { characterDisplayOrder } from './character-order';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export interface StampFilters { query: string; character: string; ownership: string }
export function stampsMarkup(master: Masterdata, collection: Collection, filters: StampFilters): string {
  const owned = new Set(collection.ownedStampIds ?? []);
  return `<section class="stamp-management"><div class="catalog-filters">
    <label class="field">スタンプ名で検索<input type="search" data-stamp-query value="${escape(filters.query)}"></label>
    <label class="field">対象キャラ<select data-stamp-character aria-label="対象キャラ"><option value="">すべてのキャラ</option>${characterDisplayOrder(master.characters).map(c=>`<option value="${c.id}" ${filters.character===String(c.id)?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label>
    <label class="field">所持状態<select data-stamp-ownership aria-label="所持状態"><option value="">すべて</option><option value="owned" ${filters.ownership==='owned'?'selected':''}>所持</option><option value="unowned" ${filters.ownership==='unowned'?'selected':''}>未所持</option></select></label>
    </div><p class="muted">所持の変更は自動保存します。新しいスタンプは未所持から始まります。</p>
    <p data-stamp-count role="status"></p><p data-stamp-state role="status"></p>
    ${master.stamps?.length ? '' : '<p>スタンプ定義がありません。対応するマスタJSONをImportしてください。</p>'}
    <div class="stamp-list">${(master.stamps??[]).map(stamp=>`<article class="panel stamp-card" data-stamp-id="${stamp.id}"><label class="stamp-toggle"><input type="checkbox" data-stamp-owned="${stamp.id}" ${owned.has(stamp.id)?'checked':''}><span>${escape(stamp.name)}<small>${stamp.characterIds.length?stamp.characterIds.map(id=>escape(master.characters.find(c=>c.id===id)!.name)).join(' / '):'対象キャラなし'}</small></span><strong data-stamp-status>${owned.has(stamp.id)?'所持':'未所持'}</strong></label></article>`).join('')}</div></section>`;
}
export function bindStamps(root: HTMLElement, master: Masterdata, collection: Collection, filters: StampFilters,
  save: (ids: number[]) => boolean): void {
  const section = root.querySelector<HTMLElement>('.stamp-management');
  if (!section) return;
  const owned = new Set(collection.ownedStampIds ?? []);
  const apply = () => {
    let visible = 0;
    for (const row of section.querySelectorAll<HTMLElement>('[data-stamp-id]')) {
      const stamp = master.stamps!.find(s=>s.id===Number(row.dataset.stampId))!;
      row.hidden = !stamp.name.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase())
        || Boolean(filters.character && !stamp.characterIds.includes(Number(filters.character)))
        || Boolean(filters.ownership && (filters.ownership==='owned')!==owned.has(stamp.id));
      if (!row.hidden) visible++;
    }
    section.querySelector('[data-stamp-count]')!.textContent = `表示 ${visible} / 全 ${master.stamps?.length??0}種類 · 所持 ${owned.size}種類`;
  };
  section.querySelector<HTMLInputElement>('[data-stamp-query]')!.addEventListener('input', event=>{filters.query=(event.target as HTMLInputElement).value;apply();});
  for (const key of ['character','ownership'] as const) section.querySelector<HTMLSelectElement>(`[data-stamp-${key}]`)!.addEventListener('change',event=>{filters[key]=(event.target as HTMLSelectElement).value;apply();});
  section.querySelectorAll<HTMLInputElement>('[data-stamp-owned]').forEach(input=>input.addEventListener('change',()=>{
    const id=Number(input.dataset.stampOwned), next=new Set(owned);
    if (input.checked) next.add(id); else next.delete(id);
    const state=section.querySelector('[data-stamp-state]')!;
    if (save([...next])) {
      owned.clear();next.forEach(id=>owned.add(id));state.textContent='スタンプ所持を保存しました';
      input.closest('label')!.querySelector('[data-stamp-status]')!.textContent=input.checked?'所持':'未所持';
    } else { input.checked=owned.has(id);state.textContent='保存できませんでした。所持状態は変更していません。'; }
    apply();
  }));
  apply();
}
