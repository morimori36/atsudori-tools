import type { Masterdata } from '../data/catalog/model';
import { tableFields, tableLabels } from '../data/catalog/fields';
import type { CatalogTable, FieldKind } from '../data/catalog/fields';
import { catalogIssues, validateCatalog, importCatalog, exportCatalog, CATALOG_LIMIT, emptyCatalog } from '../data/catalog/validate';

const esc = (v: unknown): string => String(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export interface EditorState { table: CatalogTable; index: number; readId: number }
export interface EditorActions {
  replace(next: Masterdata, explicitRecovery?: boolean): void;
  render(): void;
  report(action: () => void, success: string): void;
  download(text: string, filename: string): void;
  damaged?: string;
}
const rowsOf = (m: Masterdata, table: CatalogTable): unknown[] => m[table] as unknown[];
const rowObject = (row: unknown, table: CatalogTable): Record<string, unknown> =>
  table === 'characterRankLevels' ? { value: row } : (row ?? {}) as Record<string, unknown>;
export function catalogEditorMarkup(m: Masterdata, state: EditorState): string {
  const issues = catalogIssues(m);
  const rows = rowsOf(m,state.table);
  const row = rowObject(rows[state.index], state.table);
  const input = (key: string, label: string, v: unknown, kind: string): string =>
    '<label class="field"><span>' + esc(label) + '</span><input name="' + esc(key) + '" ' +
    (kind === 'text' || kind === 'ids' || kind === 'pair' ? 'type="text"' : 'type="number" step="1" min="' + (kind === 'zeroInteger' ? '0' : '1') + '"') +
    ' required value="' + esc(v ?? '') + '"></label>';
  return '<section class="panel"><h2>マスターデータ</h2><p>データは同梱していません。表を手動で登録・編集できます。JSONの入出力は「JSON Import / Export」で行います。保存先はこのブラウザ内です。</p>' +
    '<p>メンバー ' + m.members.length + ' / Snap ' + m.snaps.length + ' / バンド ' + m.bands.length + '</p>' +
    (issues.length ? '<div class="alert error" role="alert"><strong>不足・不整合（計算できません）</strong><ul>' + issues.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul></div>' : '') +
    '<form id="catalog-meta"><div class="form-grid">' + input('catalogId','catalogId（同じデータ体系で固定）',m.catalogId,'text') + input('revision','revision（版）',m.revision,'text') +
    '</div><button class="secondary" type="submit">識別子・版を保存</button></form></section>' +
    '<section class="panel"><h2>手動登録・編集</h2><p class="muted">バンド→キャラクター→育成テーブル→カードの順に登録します。作成途中は不足を表示し、計算を保留します。IDを変えるときも参照は自動書換えしません。</p>' +
    '<label class="field"><span>編集する表</span><select id="catalog-table">' + Object.keys(tableFields).map(t => '<option value="' + t + '" ' + (state.table === t ? 'selected' : '') + '>' + tableLabels[t as CatalogTable] + ' (' + rowsOf(m,t as CatalogTable).length + ')</option>').join('') + '</select></label>' +
    '<label class="field"><span>編集する行</span><select id="catalog-row"><option value="-1">新規登録</option>' + rows.map((v,i) => '<option value="' + i + '" ' + (state.index === i ? 'selected' : '') + '>' + esc(JSON.stringify(v).slice(0,150)) + '</option>').join('') + '</select></label>' +
    '<form id="catalog-row-form"><div class="form-grid">' + Object.entries(tableFields[state.table]).map(([key,kind]) => {
      const v = row[key];
      if (kind === 'stats') return ['performance','technic','visual'].map(ch => input(key + '.' + ch,key + '.' + ch,(v as Record<string,unknown> | undefined)?.[ch],'zeroInteger')).join('');
      return input(key, key + (kind === 'ids' || kind === 'pair' ? '（カンマ区切りの整数）' : ''), Array.isArray(v) ? v.join(',') : v, kind);
    }).join('') + '</div><button class="primary" type="submit">' + (state.index < 0 ? '行を登録' : '行を更新') + '</button> ' +
    (state.index >= 0 ? '<button class="secondary danger" type="button" id="catalog-delete">この行を削除</button>' : '') + '</form></section>' +
    '<section class="panel"><h2>初期化</h2><button class="secondary danger" id="catalog-clear">マスタを空にする</button></section>';

}
export function bindCatalogEditor(root: HTMLElement, m: Masterdata, state: EditorState, actions: EditorActions): void {
  const report = (action: () => void, success: string): void => actions.report(action,success);
  root.querySelector('#catalog-table')?.addEventListener('change', e => { state.table = (e.target as HTMLSelectElement).value as CatalogTable; state.index = -1; actions.render(); });
  root.querySelector('#catalog-row')?.addEventListener('change', e => { state.index = Number((e.target as HTMLSelectElement).value); actions.render(); });
  root.querySelector('#catalog-meta')?.addEventListener('submit', e => { e.preventDefault(); report(() => {
    const fd = new FormData(e.target as HTMLFormElement);
    actions.replace(validateCatalog({...m, catalogId:fd.get('catalogId'), revision:fd.get('revision')}));
  },'マスタの識別子・版を反映しました'); });
  root.querySelector('#catalog-row-form')?.addEventListener('submit', e => { e.preventDefault(); report(() => {
    const fd = new FormData(e.target as HTMLFormElement); const row: Record<string,unknown> = {};
    for (const [key,k] of Object.entries(tableFields[state.table]) as [string,FieldKind][]) {
      const text = String(fd.get(key) ?? '').trim();
      if (k === 'stats') row[key] = Object.fromEntries(['performance','technic','visual'].map(ch => {
        const s = String(fd.get(key + '.' + ch) ?? '').trim(); if (!s) throw new Error(key + '.' + ch + ': 未入力です');
        return [ch,Number(s)];
      }));
      else if (k === 'text') row[key] = text;
      else if (k === 'ids' || k === 'pair') {
        if (!text || text.split(',').some(s => !s.trim())) throw new Error(key + ': 整数をカンマで区切ってください');
        row[key] = text.split(',').map(s => Number(s.trim()));
      } else { if (!text) throw new Error(key + ': 未入力です'); row[key] = Number(text); }
    }
    const next = structuredClone(m); const rows = rowsOf(next,state.table);
    const value = state.table === 'characterRankLevels' ? row.value : row;
    if (state.index < 0) rows.push(value); else rows[state.index] = value;
    actions.replace(validateCatalog(next)); state.index = -1;
  },'行を反映しました'); });
  root.querySelector('#catalog-delete')?.addEventListener('click', () => {
    if (!window.confirm('この行を削除します。参照行の自動削除はしません。')) return;
    report(() => { const next = structuredClone(m); rowsOf(next,state.table).splice(state.index,1); actions.replace(validateCatalog(next)); state.index = -1; },'行を削除しました');
  });
  root.querySelector('#catalog-export')?.addEventListener('click', () => report(() => actions.download(exportCatalog(m),'atsudori-catalog.json'),'マスタJSONをExportしました'));
  if (actions.damaged !== undefined) {
    const original = root.querySelector<HTMLButtonElement>('#catalog-original');
    if (original) { original.hidden = false; original.addEventListener('click', () => actions.download(actions.damaged!,'atsudori-original-catalog.json')); }
  }
  root.querySelector('#catalog-import')?.addEventListener('change', async e => {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const id = ++state.readId; (e.target as HTMLInputElement).value = '';
    report(() => {}, 'マスタを検証中…');
    try {
      if (file.size > CATALOG_LIMIT) throw new Error('マスタJSONの上限は10MiBです');
      const text = await file.text(); if (id !== state.readId) return;
      const next = importCatalog(text);
      report(() => { actions.replace(next,true); state.index = -1; },'マスタをImportしました');
    } catch (error) { if (id === state.readId) report(() => { throw error; },''); }
  });
  root.querySelector('#catalog-clear')?.addEventListener('click', () => {
    if (!window.confirm('マスタを空にします。必要なJSONをExport済みですか？ 所持参照が残っていれば拒否します。')) return;
    report(() => { actions.replace(emptyCatalog(),true); state.index = -1; },'マスタを空にしました');
  });
}
