import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { characterDisplayOrder } from './character-order';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export interface StampFilters { query: string; character: string; ownership: string }
export function stampsMarkup(master: Masterdata, collection: Collection, filters: StampFilters): string {
  const owned = new Set(collection.ownedStampIds ?? []);
  const toggles = (key: 'character' | 'ownership', label: string, values: [string | number, string][]) =>
    `<fieldset class="filter-group"><legend>${label}</legend><div class="filter-options">${[['', 'すべて'], ...values].map(([id, name]) => `<label><input type="radio" name="stamp-${key}" data-stamp-${key} value="${id}" ${String(id) === filters[key] ? 'checked' : ''}><span>${escape(name)}</span></label>`).join('')}</div></fieldset>`;
  return `<section class="stamp-management"><section class="panel catalog-tools" aria-label="一覧の絞り込み"><div class="catalog-toolbar">
    <label class="field catalog-search"><span>名前・IDで検索</span><input type="search" data-stamp-query value="${escape(filters.query)}" placeholder="名前やIDを入力"></label>
    ${toggles('ownership', '所持状況', [['owned', '所持'], ['unowned', '未所持']])}
    </div><details class="catalog-filters" ${filters.character ? 'open' : ''}><summary>詳細フィルタ</summary><div class="catalog-filter-grid">${toggles('character', 'キャラクター', characterDisplayOrder(master.characters).map(c => [c.id, c.name]))}</div></details>
    <button class="secondary small" type="button" data-reset-filters>絞り込みを解除</button>
    <p class="muted catalog-count" data-stamp-count role="status"></p><p class="muted catalog-help">カードをクリックして所持切替 · 変更は自動保存</p></section>
    <p data-stamp-state role="status"></p>
    ${master.stamps?.length ? '' : '<p>スタンプ定義がありません。対応するマスタJSONをImportしてください。</p>'}
    <div class="catalog-grid snap-grid">${(master.stamps??[]).map(stamp=>`<article class="panel collection-card stamp-card ${owned.has(stamp.id)?'is-owned':''}" data-stamp-id="${stamp.id}"><button type="button" class="card-identity" data-stamp-owned="${stamp.id}" aria-pressed="${owned.has(stamp.id)}" aria-label="${escape(stamp.name)}の所持を切り替え"><span class="card-meta"><span class="card-id">ID ${stamp.id}</span><span class="ownership-badge" data-stamp-status>${owned.has(stamp.id)?'✓ 所持':'未所持'}</span></span><span class="card-name">${escape(stamp.name)}</span><span class="muted card-characters">${stamp.characterIds.length?characterDisplayOrder(master.characters.filter(c=>stamp.characterIds.includes(c.id))).map(c=>escape(c.name)).join(' / '):'対象キャラなし'}</span></button></article>`).join('')}</div>
    <p class="panel catalog-empty" hidden>条件に一致するスタンプがありません。絞り込みを変更してください。</p></section>`;
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
      const query=filters.query.trim().toLocaleLowerCase();
      row.hidden = !(stamp.name.toLocaleLowerCase().includes(query) || String(stamp.id).includes(query))
        || Boolean(filters.character && !stamp.characterIds.includes(Number(filters.character)))
        || Boolean(filters.ownership && (filters.ownership==='owned')!==owned.has(stamp.id));
      if (!row.hidden) visible++;
    }
    section.querySelector('[data-stamp-count]')!.textContent = `表示 ${visible} / 全 ${master.stamps?.length??0}種類 · 所持 ${owned.size}種類`;
    section.querySelector<HTMLElement>('.catalog-empty')!.hidden = visible > 0 || !master.stamps?.length;
  };
  const query = section.querySelector<HTMLInputElement>('[data-stamp-query]')!;
  query.addEventListener('input', ()=>{filters.query=query.value;apply();});
  for (const key of ['character','ownership'] as const) section.querySelectorAll<HTMLInputElement>(`[data-stamp-${key}]`).forEach(input=>input.addEventListener('change',()=>{filters[key]=input.value;apply();}));
  section.querySelector('[data-reset-filters]')!.addEventListener('click',()=>{
    filters.query='';filters.character='';filters.ownership='';query.value='';
    for (const key of ['character','ownership']) section.querySelectorAll<HTMLInputElement>(`[data-stamp-${key}]`).forEach(input=>{input.checked=input.value==='';});
    apply();
  });
  section.querySelectorAll<HTMLButtonElement>('[data-stamp-owned]').forEach(button=>button.addEventListener('click',()=>{
    const id=Number(button.dataset.stampOwned), next=new Set(owned);
    if (owned.has(id)) next.delete(id); else next.add(id);
    const state=section.querySelector('[data-stamp-state]')!;
    if (save([...next])) {
      owned.clear();next.forEach(id=>owned.add(id));state.textContent='';
      button.setAttribute('aria-pressed',String(owned.has(id)));
      button.closest('article')!.classList.toggle('is-owned',owned.has(id));
      button.querySelector('[data-stamp-status]')!.textContent=owned.has(id)?'✓ 所持':'未所持';
    } else { state.textContent='保存できませんでした。所持状態は変更していません。'; }
    apply();
  }));
  apply();
}
