import { collectionCardAttributes, collectionCardIdentity, editableStages } from './collection-card';
import { createResourceInventoryView } from './resource-inventory';
import { createCharacterExpView } from './character-exp';
import { applyTrainingConditions } from '../app/training-conditions';
import { trainingConditions } from '../app/hypothetical-training';
import { stampsMarkup, bindStamps } from './stamps';
import { automaticCharacterProgress } from '../domain/character-rank/automatic-progress';
import { cardIdentity, rarity } from './card-identity';
import { bandItemsForDisplay } from './band-item-order';
import { progressCharacters, characterDisplayOrder, characterRowsForDisplay } from './character-order';
import { createMaterialsPage, bindMaterialCopy, materialShortageText } from './materials';
import { createTrainingSettings } from '../storage/training-settings';
import { trainingSettingsMarkup, bindTrainingSettings, preserveTrainingView } from './training-settings';
type Theme = 'light' | 'dark' | 'system';
const themeKey = 'atsudori-theme';
function getTheme(): Theme {
  try {
    const value = localStorage.getItem(themeKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}
function setTheme(value: string, persist = true): void {
  const theme: Theme = value === 'light' || value === 'dark' ? value : 'system';
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme;
  if (persist) {
    try { localStorage.setItem(themeKey, theme); } catch { /* Theme still applies for this session. */ }
  }
}
setTheme(getTheme(), false);

import { resolveTotalRankBonus } from '../domain/character-rank/bonus';
import { estimateCharacterRank, estimateCharacterRanks, sumCharacterRanks } from '../domain/character-rank/estimate';
import { estimateBondRankTheory } from '../domain/character-rank/bond-theory';
import { editableProgressKeys }  from '../domain/character-rank/definitions';
import type { CharacterProgress } from '../domain/character-rank/definitions';
import type { Masterdata } from '../data/catalog/model';
import { emptyCatalog, validateCatalog, catalogIssues, importCatalog, exportCatalog, CATALOG_LIMIT } from '../data/catalog/validate';
import { deriveMemberDisplay, deriveSnapDisplay } from '../data/catalog/growth';
import { calculateRating } from '../domain/rating/calculate';
import type { RatingInput, Stats } from '../domain/rating/calculate';
import type { Choice, MemberCandidate, SnapCandidate } from '../domain/selection/select';
import { cardTypeName, cardTypeAccent } from '../data/catalog/card-types';
import { summarizeBands, summarizeCharacters, evaluateCollection } from '../app/evaluate-collection';
import { simulateTrainingEvaluation } from '../app/training-simulation';
import { emptyCollection, validateCollection, importCollection, exportCollection } from '../storage/collection';
import type { Collection, OwnedMember } from '../storage/collection';
import { prepareCollectionImport } from '../storage/collection-import';
import { loadCollection, saveCollection, loadCatalog, saveCatalog } from '../storage/local';
import type { StoragePort } from '../storage/local';
import { createEventPlanner } from './event-planner';
import { createRankRules } from './rank-rules';
import { createConversionExport } from './conversion-export';

type Tab = 'inventory' | 'materials' | 'rating' | 'members' | 'snaps' | 'stamps' | 'progress' | 'items' | 'exchange' | 'manual' | 'event';
const tabs: [Tab, string][] = [['rating', '評価値'], ['event', 'イベント周回プランナー'], ['members', 'メンバー'], ['snaps', 'スナップ'], ['stamps', 'スタンプ'],
  ['inventory', '素材在庫'], ['materials', '必要素材'], ['progress', 'キャラランク'], ['items', 'バンドアイテム'], ['exchange', 'JSON Import / Export'], ['manual', '表示値で計算']];
const headings: Record<Tab, [string, string]> = {
  inventory: ['素材在庫', '素材の現在庫を登録します。変更は自動保存されます。'],
  materials: ['必要素材', '共通育成条件で必要な素材と、素材別の消費内訳を確認します。'],
  event: ['イベント周回プランナー', '通常とチャレンジの候補を比較し、目標イベントptまでの最小周回数を計算します。'],
  rating: ['バンド評価値', 'バンド全体の合計と、色・メンバーごとの内訳を表示します。'],
  members: ['所持メンバー', 'Lv・特訓・覚醒と、ライブ／撃奏スキルLvを登録します。'],
  snaps: ['所持スナップ', 'Lvと上限解放段階を登録します。対応キャラクターは登録したマスタから読み取ります。'],
  stamps: ['スタンプ', '所持スタンプを登録すると、対象キャラ全員のランク推定に反映します。'],
  progress: ['キャラランク', '現在のランクと、共通育成条件・絆最大時の理論値を確認します。進捗・ランク入力の変更は保存してください。'],
  items: ['バンドアイテム', '各バンドのアイテムLvを編集します。変更はこの画面で保存してください。'],
  exchange: ['JSON Import / Export', 'JSONファイルを取り込み・保存します。'],
  manual: ['表示値で個別計算', 'ゲーム画面のP/T/Vと補正値を直接入力して、1枠の評価値を確認します。'],
};
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number): string => value.toLocaleString('ja-JP');
const pct = (value: number): string => (value / 100).toFixed(2);
const field = (name: string, label: string, value: number | string = '', min = 1, max?: number): string =>
  `<label class="field" for="${name}"><span>${label}</span><input id="${name}" name="${name}" type="number" min="${min}" ${max ? `max="${max}"` : ''} step="1" value="${escape(value)}" required></label>`;
function fixed(value: FormDataEntryValue | null, digits: number, label: string): number {
  const text = String(value ?? '').trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(text)) throw new Error(`${label}は小数${digits}桁以内で入力してください`);
  const [whole, fraction = ''] = text.split('.');
  const scaled = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(scaled)) throw new Error(`${label}が大きすぎます`);
  return scaled;
}
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function mountApp(root: HTMLElement): void {
  let storage: StoragePort | undefined;
  try { storage = window.localStorage; } catch { storage = undefined; }
  const loadedCatalog = loadCatalog(storage);
  let master: Masterdata = loadedCatalog.status === 'loaded' ? loadedCatalog.value : emptyCatalog();
  let allowCatalogWrites = loadedCatalog.status !== 'invalid';
  let catalogSaved = loadedCatalog.status === 'loaded' || loadedCatalog.status === 'empty';
  const damagedCatalog = loadedCatalog.status === 'invalid' ? loadedCatalog.raw : undefined;
  let catalogStorageMessage = loadedCatalog.status === 'invalid' ? '保存マスタが破損しています。元JSONを保護中です。JSON Import / ExportでExport・Importまたは初期化してください。' : loadedCatalog.status === 'unavailable' ? loadedCatalog.error : '';

  const loaded = loadCollection(storage, master);
  let collection: Collection = loaded.status === 'loaded' ? loaded.collection : emptyCollection(master);
  let allowWrites = loaded.status !== 'invalid';
  const damagedBackup = loaded.status === 'invalid' ? loaded.raw : undefined;
  let saved = loaded.status === 'loaded' || loaded.status === 'empty';
  let storageMessage = loaded.status === 'invalid' ? `保存データを読み込めません。元JSONを保持しています。${loaded.error}`
    : loaded.status === 'unavailable' ? loaded.error : '';
  let active: Tab = 'rating';
  const eventPlanner = createEventPlanner(storage, syncSaveState);
  const rankRules = createRankRules(()=>master);
  const manualProgressFields = () => {const labels=rankRules.labels();return Object.fromEntries(editableProgressKeys.map(key=>[key,labels[key]??`進捗 ${key}`]));};
  const trainingSettings = createTrainingSettings(storage);
  const conversionExport = createConversionExport(storage, () => ({master,collection,rules:rankRules.current(),protected:!allowWrites || !allowCatalogWrites}), download, trainingSettings);
  let ratingMode: 'current' | 'potential' = 'current';
  const expView={targetRank:30};
  let characterExpView:ReturnType<typeof createCharacterExpView>|undefined;
  let inventoryView:ReturnType<typeof createResourceInventoryView>|undefined;
  const inventoryState = {query:'',drafts:new Map<string,string>()};
  let noteListenerController = new AbortController();
  let notice: { error: boolean; text: string } | undefined;
  const drafts = new Map<string, Record<string, string>>();
  const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; save: () => void }>();
  function flushAutosaves(): void {
    for (const [key, pending] of pendingSaves) { clearTimeout(pending.timer); pendingSaves.delete(key); pending.save(); }
  }
  function cancelAutosaves(): void {
    for (const pending of pendingSaves.values()) clearTimeout(pending.timer);
    pendingSaves.clear();
  }
  const filters = { members: { query: '', band: '', character: '', type: '', rarity: '', ownership: '', skill: '', secondarySkill: '', sort: 'id' },
    snaps: { query: '', band: '', character: '', type: '', rarity: '', ownership: '', skill: '', secondarySkill: '', sort: 'id' } };
  const stampFilters = {query:'',character:'',ownership:''};
  let importReadId = 0;
  let catalogReadId = 0;

  function persist(next: Collection): void {
    collection = validateCollection(next, master);
    if (!allowWrites) { saved = false; storageMessage = '元の保存JSONを保護しています。Exportか、Import画面で新規作成・置き換えを選んでください。'; }
    else {
      const result = saveCollection(storage, collection, master);
      saved = result.status === 'saved';
      storageMessage = result.status === 'failed' ? `ブラウザ保存ができませんでした。JSONをExportしてください。${result.error}` : '';
    }
  }
  function replaceCatalog(next: Masterdata): void {
    flushAutosaves();
    const candidate = validateCatalog(next);
    const nextCollection = validateCollection(collection, candidate);
    const result = saveCatalog(storage, candidate);
    if (result.status === 'failed') throw new Error('マスタを保存できません。' + result.error);
    cancelAutosaves(); drafts.clear(); inventoryState.drafts.clear(); importReadId++;
    allowCatalogWrites = true;
    catalogReadId++;
    master = candidate; collection = nextCollection;
    // Keep edits for surviving targets, but never reinsert IDs removed by a catalog update.
    for (const name of progressDraft.keys()) {
      const character = /^(?:rank|progress)-(\d+)(?:-|$)/.exec(name);
      const item = /^item-(\d+)$/.exec(name);
      if ((character && !master.characters.some(c => c.id === Number(character[1]))) ||
          (item && !master.bandItems.some(i => i.id === Number(item[1])))) progressDraft.delete(name);
    }
    catalogSaved = true; catalogStorageMessage = '';
    // Restoring the catalog can make an intact, previously unmatched collection readable again.
    if (!allowWrites) {
      const restored = loadCollection(storage, master);
      if (restored.status === 'loaded') { collection = restored.collection; allowWrites = true; saved = true; storageMessage = ''; }
    }
  }
  function missingCatalog(): string {
    const issues = catalogIssues(master);
    return '<section class="panel"><h2>' + (issues.length ? 'マスタに不足・不整合があります' : 'マスタ未登録') + '</h2><p>JSON Import / Exportで適切なマスタJSONをImportしてください。表示値での個別計算はマスタなしでも利用できます。</p>' +
      (issues.length ? '<ul>' + issues.map(i => '<li>' + escape(i) + '</li>').join('') + '</ul>' : '') +
      '<button class="primary" data-tab="exchange">JSON Import / Exportを開く</button> <button class="secondary" data-tab="manual">表示値で計算</button></section>';
  }
  function download(text: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function run(action: () => void, success?: string): void {
    try { action(); notice = success ? { error: false, text: success } : undefined; }
    catch (error) { notice = { error: true, text: errorMessage(error) }; }
    render();
  }
  function choice<T extends MemberCandidate | SnapCandidate>(value: Choice<T>, card: (id: number) => Masterdata['members'][number] | Masterdata['snaps'][number]): string {
    if (value.status === 'none') return '<span class="muted">なし</span>';
    const label = (candidate: T) => `<span class="rating-candidate">${cardIdentity(card(candidate.id))}</span>`;
    const candidates = value.status === 'selected' ? [value.candidate] : value.candidates;
    return `<span class="rating-choices">${candidates.map(label).join('')}</span>`;
  }
  function noteMarker(notes: readonly string[], id: string, label: string): string {
    if (!notes.length) return '';
    return `<button type="button" class="note-marker" data-note-target="${id}" aria-label="${label}" aria-describedby="${id}">※</button><span class="selection-tooltip" popover="auto" role="tooltip" id="${id}">${notes.map(n => `<span>${escape(n)}</span>`).join('')}</span>`;
  }
  function bindNotes(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-note-target]').forEach(button => {
      const tip = document.getElementById(button.dataset.noteTarget!)!;
      const hide = () => { if (tip.matches(':popover-open')) tip.hidePopover(); };
      const show = () => {
        if (!tip.matches(':popover-open')) tip.showPopover();
        const rect = button.getBoundingClientRect();
        const width = tip.getBoundingClientRect().width;
        const height = tip.getBoundingClientRect().height;
        tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
        tip.style.top = `${Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6)}px`;
      };
      button.addEventListener('mouseenter', show);
      button.addEventListener('mouseleave', () => { if (document.activeElement !== button) hide(); });
      button.addEventListener('focus', show);
      button.addEventListener('blur', hide);
      button.addEventListener('click', show);
      window.addEventListener('scroll', hide, { capture: true, signal: noteListenerController.signal });
      window.addEventListener('resize', hide, { signal: noteListenerController.signal });
    });
  }
  function ratingPage(): string {
    const controls = `<div class="rating-mode"><fieldset class="filter-group"><legend class="sr-only">評価値の表示</legend><div class="filter-options">${([['current', '現在'], ['potential', '育成後']] as const).map(([value, label]) => `<label><input type="radio" name="rating-mode" value="${value}" ${ratingMode === value ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset></div>${trainingSettingsMarkup(trainingSettings)}`;
    if (!master.members.length || catalogIssues(master).length) return controls + missingCatalog();
    const bands = ratingMode === 'potential' ? simulateTrainingEvaluation(master,collection,trainingSettings.current()).after.bands : summarizeBands(evaluateCollection(master,collection,collection,rankRules.current()));
    const colors = bands.flatMap(b => b.colors);
    if (!colors.length) return `${controls}<section class="panel empty"><div class="empty-symbol">＋</div><h2>所持データから始める</h2>
      <p>メンバーとスナップを登録し、キャラクターランク・アイテムを設定すると、登録分の評価値を確認できます。</p>
      <button class="primary" data-tab="members">メンバーを登録</button><button class="secondary" data-tab="manual">表示値で試す</button></section>`;
    return `${controls}${bands.map(band => `<section class="panel band-result" data-band="${band.bandId}">
        <div class="panel-heading"><div><h2>${escape(master.bands.find(b => b.id === band.bandId)!.name)}</h2></div>
        <div class="rating-total"><span>${band.rating === null ? 'バンド全体の合計は保留' : '合計'}</span><strong>${band.rating === null ? '—' : number(band.rating)}</strong>
        ${band.rating === null ? `<small>計算済み小計 ${number(band.subtotal)}</small>` : ''}</div></div>
        ${band.colors.map(color => `<details class="color-result" data-band="${color.bandId}" data-color="${color.cardType}" style="--card-color: ${cardTypeAccent(color.cardType)}" ${band.colors.length === 1 ? 'open' : ''}>
        <summary class="color-summary"><span class="color-label">${cardTypeName(color.cardType)}</span>
        <span class="color-total"><span>${color.rating === null ? '合計は保留' : ''}</span><strong>${color.rating === null ? '—' : number(color.rating)}</strong>${color.rating === null ? `<small>計算済み小計 ${number(color.subtotal)}</small>` : ''}</span></summary>
        <div class="table-scroll"><table><thead><tr><th>メンバー</th><th>スナップ</th><th class="numeric">評価値</th></tr></thead><tbody>
        ${characterRowsForDisplay(summarizeCharacters(color), master.characters.filter(c => c.bandId === band.bandId), c => c.characterId).map(character => `<tr class="character-heading" data-rating-character="${character.characterId}"><th scope="rowgroup" colspan="${character.slots.length === 1 ? 3 : 2}">${escape(master.characters.find(c => c.id === character.characterId)!.name)}</th>${character.slots.length === 1 ? '' : `<td class="numeric character-total">${character.rating === null ? `<span>合計は保留</span><strong>—</strong><small>計算済み小計 ${number(character.subtotal)}</small>` : `<span>合計</span><strong>${number(character.rating)}</strong>`}</td>`}</tr>
        ${character.slots.map(slot => {
          const memberKey = slot.selection.member.status === 'selected' ? `member-${slot.selection.member.candidate.id}` : `pending-${slot.selection.characterId}`;
          const key = `note-${band.bandId}-${color.cardType}-${memberKey}`;
          const note = noteMarker(slot.selection.notices, key, '暫定選出の注記');
          return `<tr data-rating-slot="${memberKey}"><td><div class="candidate">${choice(slot.selection.member, id => master.members.find(m => m.id === id)!)}${slot.selection.snap.status === 'none' ? note : ''}</div></td>
          <td><div class="candidate">${choice(slot.selection.snap, id => master.snaps.find(s => s.id === id)!)}${slot.selection.snap.status !== 'none' ? note : ''}</div></td>
          <td class="numeric">${slot.result ? `<strong class="slot-rating">${number(slot.result.bandRating)}</strong>`
            : `<span class="pending-pill">${slot.selection.status === 'resolved' ? '入力待ち' : '選出未確定'}</span>${noteMarker(slot.reasons, key + '-pending', '計算待ちの理由')}`}</td></tr>`;
        }).join('')}`).join('</tbody><tbody>')}
        </tbody></table></div></details>`).join('')}</section>`).join('')}
`;
  }
  function catalogPage(kind: 'members' | 'snaps'): string {
    const members = kind === 'members';
    const rows = members ? master.members : master.snaps;
    const filter = filters[kind];
    for (const [key, skillKind] of [['skill',members ? 'live' : 'support'],['secondarySkill',members ? 'gekisou' : 'gekisouSupport']] as const) {
      if (filter[key] && !master.skillCategories?.some(c => c.kind === skillKind && String(c.id) === filter[key])) filter[key] = '';
    }
    const toggles = (key: keyof typeof filter, label: string, values: [string | number, string][]): string =>
      `<fieldset class="filter-group"><legend>${label}</legend><div class="filter-options">${[['', 'すべて'], ...values].map(([id, text], index) => {
        const controlId = `filter-${kind}-${key}-${index}`;
        return `<label for="${controlId}"><input type="radio" id="${controlId}" name="filter-${kind}-${key}" data-filter="${key}" value="${id}" ${String(id) === filter[key] ? 'checked' : ''}><span>${escape(text)}</span></label>`;
      }).join('')}</div></fieldset>`;
    return `<section class="panel catalog-tools" aria-label="一覧の絞り込み"><div class="catalog-toolbar">
      <label class="field catalog-search"><span>名前・タイトル・IDで検索</span><input type="search" data-filter="query" value="${escape(filter.query)}" placeholder="名前やタイトルを入力"></label>
      ${toggles('ownership', '所持状況', [['owned', '所持'], ['unowned', '未所持']])}
      <div class="field"><label for="filter-${kind}-sort">並び替え</label><select id="filter-${kind}-sort" data-filter="sort">${[['id', 'ID順'], ['name', '名前順'], ['rarity', 'レアリティ順'], ['level', 'Lvが高い順'], ['owned', '所持を先に']].map(([id, label]) => `<option value="${id}" ${filter.sort === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      </div><details class="catalog-filters" ${filter.band || filter.character || filter.type || filter.rarity || filter.skill || filter.secondarySkill ? 'open' : ''}><summary>詳細フィルタ</summary><div class="catalog-filter-grid">      ${toggles('band', 'バンド', master.bands.map(b => [b.id, b.name]))}
      ${toggles('character', 'キャラクター', characterDisplayOrder(master.characters).map(c => [c.id, c.name]))}
      ${toggles('type', '色', [...new Set(rows.map(r => r.cardType))].sort((a,b) => a-b).map(t => [t, cardTypeName(t)]))}
      ${toggles('rarity', 'レアリティ', [...new Set(rows.map(r => r.rarity))].sort((a,b) => b-a).map(r => [r, rarity(r)]))}
      ${toggles('skill', members ? 'ライブスキル種別' : 'サポートスキル種別', (master.skillCategories ?? []).filter(c => c.kind === (members ? 'live' : 'support')).map(c => [c.id, c.name]))}
      ${toggles('secondarySkill', members ? '撃奏スキル種別' : '撃奏サポートスキル種別', (master.skillCategories ?? []).filter(c => c.kind === (members ? 'gekisou' : 'gekisouSupport')).map(c => [c.id, c.name]))}
      </div></details>
      <button class="secondary small" type="button" data-reset-filters>絞り込みを解除</button>
      <p class="muted catalog-count" role="status"></p>
      <p class="muted catalog-help">カードをクリックして所持切替 · 段階の変更は自動保存</p>
    </section><div class="catalog-grid ${members ? 'member-grid' : 'snap-grid'}">${rows.map(row => {
      const owned = members ? collection.members.find(m => m.cardId === row.id) : collection.snaps.find(s => s.supportCardId === row.id);
      const member = members ? owned as OwnedMember | undefined : undefined;
      const snap = !members ? collection.snaps.find(s => s.supportCardId === row.id) : undefined;
      const characters = 'characterId' in row ? [row.characterId] : row.characterIds;
      const draft = drafts.get(kind + row.id);
      const value = (key: string, saved?: number): string | number => draft ? draft[key] ?? '' : saved ?? '';
      const checked = (key: string, saved: boolean): boolean => draft ? key in draft : saved;
      const stages = (key: string, label: string, saved: number | undefined, levels: number[]): string =>
        editableStages(`${kind}-${row.id}`, key, label, value(key, saved), levels);
      return `<article ${collectionCardAttributes(row, Boolean(owned))} data-catalog-id="${row.id}" data-member-card="${members ? row.id : ''}" data-snap-card="${members ? '' : row.id}">
        ${collectionCardIdentity(row, checked('owned', Boolean(owned)), !members ? characterRowsForDisplay(characters.map(id => master.characters.find(c => c.id === id)!), master.characters, c => c.id).map(c => c.name).join(' / ') : '')}
        <form data-card-form="${row.id}"><input type="hidden" name="${members ? 'cardId' : 'supportCardId'}" value="${row.id}">
        <input type="checkbox" name="owned" hidden ${checked('owned', Boolean(owned)) ? 'checked' : ''}>
        <fieldset class="card-growth" ${checked('owned', Boolean(owned)) ? '' : 'hidden'}><legend class="sr-only">育成状況</legend><input type="hidden" name="${members ? 'memberLevel' : 'snapLevel'}" value="${owned?.level ?? ''}"><p class="derived-level" data-level-output></p><div class="form-grid">
        ${members ? stages('trainingStage', '特訓段階', member?.trainingStage, master.memberTraining.filter(r => r.group === ('trainingGroup' in row ? row.trainingGroup : -1)).map(r => r.stage)) + stages('awakeningStage', '覚醒段階 A', member?.awakeningStage, master.memberAwakening.filter(r => r.group === ('awakeningGroup' in row ? row.awakeningGroup : -1)).map(r => r.stage)) + stages('liveSkillLevel', 'ライブスキルLv', member?.liveSkillLevel, 'liveSkillLevels' in row ? row.liveSkillLevels : []) + stages('gekisouSkillLevel', '撃奏スキルLv', member?.gekisouSkillLevel, 'gekisouSkillLevels' in row ? row.gekisouSkillLevels : []) : stages('snapRank', '上限解放 U', snap?.rank, master.snapRanks.filter(r => r.group === ('rankGroup' in row ? row.rankGroup : -1)).map(r => r.rank))}
        </div><details class="card-details" ><summary>${members ? '表示P/T/V' : '表示％'}</summary><p class="preview-line" data-preview></p>

        </details></fieldset><p class="card-input-state" data-draft-state role="status">${draft ? '未保存の入力' : ''}</p></form></article>`;
    }).join('')}</div><p class="panel catalog-empty" hidden>条件に一致するカードがありません。絞り込みを変更してください。</p>`;
  }
  function membersPage(): string { return catalogPage('members'); }
  function snapsPage(): string { return catalogPage('snaps'); }
  function rankBreakdown(rank: ReturnType<typeof estimateCharacterRank>): string {
    return rank.details.map(d => `<li><span>${escape(d.definition.label)}<small>${d.value ?? '不明'} → ${d.completed}件</small></span><strong>${d.exp} EXP</strong></li>`).join('');
  }
  function rankReason(rank: ReturnType<typeof estimateCharacterRank>): string {
    return rank.reason??(rank.overrideRank === undefined ? '所持・育成と入力済みの進捗から自動推定しています。'
      : `手動上書きのランク ${rank.overrideRank} を使用します（自動推定は ${rank.estimatedRank??'—'}）。`);
  }
  let progressBand: number | undefined;
  const progressDraft = new Map<string, string>();
  function progressActions(items = false): string {
    return `<div class="progress-actions"><span data-progress-state role="status">${saved ? '変更後は保存してください' : 'ブラウザ保存未完了'}</span><button class="primary" type="submit" id="progress-save">${items ? 'バンドアイテム' : 'キャラランク'}を保存</button></div>`;
  }
  function itemsPage(): string {
    const draftValue = (name: string, fallback: unknown) => escape(progressDraft.get(name) ?? fallback ?? '');
    return `<form id="progress-form" data-edit-scope="items"><section class="progress-section" aria-labelledby="band-items-heading"><h2 id="band-items-heading">バンドアイテムLv</h2><p class="muted progress-scroll-hint">各バンドのアイテムは横にスクロールして編集できます。0 は未解放です。</p>
      <div class="progress-cards" data-progress-scroll="items" role="region" aria-label="バンドアイテムの編集欄" tabindex="0">${master.bands.map(b => `<article class="panel progress-card band-items"><h3>${escape(b.name)}</h3><div class="rank-list">${bandItemsForDisplay(master.bandItems.filter(item => item.bandId === b.id)).map(item => `<label class="inline-field" for="item-${item.id}"><span>${escape(item.name)}<small>0 は未解放</small></span><input name="item-${item.id}" id="item-${item.id}" type="number" inputmode="numeric" min="0" max="${Math.max(...master.bandItemLevels.filter(l => l.itemId === item.id).map(l => l.level))}" step="1" required value="${draftValue(`item-${item.id}`, collection.bandItems[item.id] ?? 0)}"></label>`).join('')}</div></article>`).join('')}</div></section>${progressActions(true)}</form>`;
  }
  function progressPage(): string {
    const band = master.bands.find(b => b.id === progressBand) ?? master.bands[0];
    if (band) progressBand = band.id;
    const characters = progressCharacters(master.characters.filter(c => c.bandId === band?.id));
    const draftValue = (name: string, fallback: unknown) => escape(progressDraft.get(name) ?? fallback ?? '');
    const ranks=estimateCharacterRanks(master,collection,rankRules.current()),progressLabels=manualProgressFields();
    const bonus=resolveTotalRankBonus(ranks,collection,rankRules.current());
    const trained=applyTrainingConditions(master,collection,trainingConditions(trainingSettings.current()));
    const theory = !allowWrites || !allowCatalogWrites || !band ? {status:'pending' as const,reason:'有効なマスタと所持データを登録してください。'} : estimateBondRankTheory(master,trained,band!.id);
    characterExpView=createCharacterExpView(master,collection,trainingSettings.current(),trained,expView,!allowWrites || !allowCatalogWrites);
    return `${rankRules.current()?'':'<p class="alert">ランク定義未登録または不一致：推定は未算出です。JSON Import / Exportでランク定義を含むマスタJSONをImportしてください。手入力値・進捗は保持します。</p><button class="secondary" data-tab="exchange">JSON Import / Exportを開く</button>'}${trainingSettingsMarkup(trainingSettings)}${characterExpView.targetMarkup}<form id="progress-form" data-edit-scope="characters"><div class="progress-overview"><p data-total-character-rank>総合キャラクターランク <strong>${sumCharacterRanks(ranks)?.toLocaleString('ja-JP')??'未算出'}</strong></p><span class="muted">各キャラクターの使用ランク合計</span><label class="inline-field" for="tgwRank"><span>TGWランク</span><input name="tgwRank" id="tgwRank" type="number" inputmode="numeric" min="1" max="${Number.MAX_SAFE_INTEGER}" step="1" placeholder="不明" value="${draftValue('tgwRank', collection.tgwRank)}"></label></div>
      <details class="panel" data-progress-section="total-rank"><summary>総合ランクボーナス <span data-total-rank-bonus>使用する加算値：${bonus.bonus===null?'未設定':`+${bonus.bonus}`}（${bonus.source==='manual'?'手入力':bonus.source==='rules'?'ランク定義から算出':'評価値は保留'}）</span></summary>
      <label class="inline-field" for="totalRankBonus"><span>各パラメータへの加算値（上書き）</span><input name="totalRankBonus" id="totalRankBonus" type="number" inputmode="numeric" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" placeholder="定義から算出" value="${draftValue('totalRankBonus', collection.totalRankBonus)}"></label><p class="muted">ゲームの総合ランクボーナス欄の数値を入力できます。空欄はランク定義のボーナス表を使います。個人ランク分を含む合計ボーナスとは別です。</p></details>
      <section class="progress-section" aria-labelledby="character-ranks-heading"><h2 id="character-ranks-heading">キャラクターランク</h2>
      <details class="rank-help" data-progress-section="bond-help"><summary>育成理論値とは</summary><p>保存済みの所持カードを共通育成条件まで育て、同一バンドの絆を最大にした場合の理論キャラランクです。各ペアは1から始まり、上限は2人のキャラランクの小さい方として反復計算します。手動ランク上書きと絆合計の手入力は使いません。通常の使用ランク・評価値・保存値には反映しません。</p><p>編集中の進捗は保存後に反映します。未入力進捗は加算せず、バンド内の他キャラの未入力も影響します。実機で確定した到達値ではありません。</p>${theory.status === 'pending' ? `<p data-bond-reason>未算出：${escape(theory.reason)}</p>` : ''}</details>
      <div class="progress-targets" role="group" aria-label="バンド">${master.bands.map(b => `<button type="button" data-progress-band="${b.id}" aria-pressed="${b.id===band?.id}">${escape(b.name)}</button>`).join('')}</div>
      <p class="muted progress-scroll-hint">横にスクロールして編集できます</p>
      <div class="progress-cards" data-progress-scroll="characters" role="region" aria-label="キャラクターランクの編集欄" tabindex="0">${characters.map(c => {
        const rank = ranks.find(r=>r.id===c.id)!;
        const automatic = automaticCharacterProgress(master,collection,c.id);
        const theoretical = theory.status === 'ready' ? theory.characters.find(r => r.id === c.id) : undefined;
        const uncertain = theory.status === 'ready' && theory.characters.some(r => r.missingProgress.length);
        const bondPairs=theory.status==='ready'?characters.filter(other=>other.id!==c.id).flatMap(other=>{
          const pair=theory.pairs.find(p=>(p.characterA===c.id&&p.characterB===other.id)||(p.characterB===c.id&&p.characterA===other.id));
          return pair?[`<tr data-bond-rank="${pair.rank}"><th scope="row">${escape(other.name)}</th><td>${number(pair.rank)}</td></tr>`]:[];
        }).join(''):'';
        return `<article class="panel progress-card character-rank" data-character-rank="${c.id}" data-bond-character="${c.id}"><h2>${escape(c.name)}</h2><div data-rank-summary><span>現在ランク <strong data-effective-rank>${rank.effectiveRank??'未算出'}</strong></span><span class="rank-source" data-rank-source>${rank.overrideRank===undefined?rank.estimatedRank===null?'定義未登録・不一致':'自動推定':'手動上書き中'}</span></div>
          <div class="bond-rank">育成理論値 <strong data-bond-final aria-label="育成理論値">${theoretical ? number(theoretical.finalRank) : '未算出'}</strong>${uncertain ? '<small>バンド内の進捗に未入力あり</small>' : ''}</div>${characterExpView!.summary(c.id)}
          <details data-progress-section="rank-input-${c.id}"><summary>進捗・ランク入力</summary><div class="rank-editor"><section><h3>進捗入力</h3>
          <div class="rank-list">${Object.entries(progressLabels).map(([key,label]) => `<label class="inline-field" for="progress-${c.id}-${key}"><span>${escape(label)}</span><input id="progress-${c.id}-${key}" name="progress-${c.id}-${key}" type="number" inputmode="numeric" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" placeholder="不明" value="${draftValue(`progress-${c.id}-${key}`, collection.characterProgress?.[c.id]?.[key as keyof CharacterProgress])}"></label>`).join('')}</div></section>
          <section class="rank-override"><h3>ランク上書き</h3>
          <label class="inline-field" for="rank-${c.id}"><span>手動で使用するランク</span><input name="rank-${c.id}" id="rank-${c.id}" type="number" inputmode="numeric" min="1" max="${Number.MAX_SAFE_INTEGER}" step="1" placeholder="自動" value="${draftValue(`rank-${c.id}`, rank.overrideRank)}"></label>
          <button class="secondary" type="button" data-reset-rank="${c.id}">自動推定に戻す</button></section>
          <details data-progress-section="rank-details-${c.id}"><summary>EXP内訳・推定理由 <small data-missing-progress>${rank.missingProgress.length ? '進捗に未入力あり' : ''}</small></summary><section class="automatic-progress"><h3>自動算出</h3><p>楽曲クリア種類数：<strong data-automatic-songs>${automatic.songClears}</strong><small>（マスタから算出）</small></p><p>スタンプ所持種類数：<strong data-automatic-stamps>${automatic.stamps}</strong><small>（スタンプから算出）</small></p><button class="secondary" type="button" data-tab="stamps">スタンプを開く</button></section><p class="muted">推定 <span data-estimated-rank>${rank.estimatedRank??'—'}</span> · EXP <span data-rank-exp>${rank.exp??'—'}</span></p><p class="muted" data-rank-reason>${rankReason(rank)}</p><p class="muted">空欄は不明として加算しません。未入力・未確認の条件により、推定は実際より低くなる場合があります。定義に指定された項目を所持データから自動集計します。</p><ul class="rank-breakdown" data-rank-breakdown>${rankBreakdown(rank)}</ul></details></div></details>
          <details data-progress-section="bond-${c.id}"><summary>絆内訳</summary>${theory.status==='pending'?`<p class="warning" data-bond-reason>未算出：${escape(theory.reason)}</p>`:`<p>最終絆ランク合計 <strong aria-label="最終絆合計">${number(theoretical!.bondRankTotal)}</strong></p>${theoretical!.missingProgress.length?'<p class="muted">絆以外に未入力の進捗があります。</p>':''}<table class="bond-pairs"><thead><tr><th scope="col">相手</th><th scope="col">絆ランク</th></tr></thead><tbody>${bondPairs}</tbody></table>${!bondPairs?'<p>対象ペアなし</p>':''}`}</details>${characterExpView!.button(c.id)}</article>`;
      }).join('')}</div></section>
      ${progressActions()}</form>`;
  }

  function exchangePage(): string {
    return `<div class="json-exchange"><section class="exchange-section"><h2>所持・育成データ</h2><span class="muted">${collection.members.length || collection.snaps.length || collection.ownedStampIds?.length ? '登録済み' : '未登録'}</span>
      <div class="exchange-actions"><button class="primary" data-file="import-file">Import</button><input hidden type="file" id="import-file" accept=".json,application/json"><button class="secondary" id="export-button">Export</button></div></section>
      <section class="exchange-section"><h2>マスタデータ</h2><span class="muted">${master.members.length ? '登録済み' : '未登録'}</span>
      <div class="exchange-actions"><button class="primary" data-file="catalog-import">Import</button><input hidden type="file" id="catalog-import" accept=".json,application/json"><button class="secondary" id="catalog-export">Export</button></div></section>
      <div id="conversion-export"></div>
      <details><summary>詳細情報</summary><p>catalogId: ${escape(master.catalogId)} / revision: ${escape(master.revision)}</p><p>ファイルにないキャラクター進捗・TGWランク・スタンプ所持は現在の値を保持します。スタンプ所持の空配列は全解除です。</p>
      ${damagedBackup !== undefined ? '<button class="secondary" id="damaged-backup">元の保存JSONをダウンロード</button>' : ''}
      ${damagedCatalog !== undefined ? '<button class="secondary" id="catalog-original">元の保存マスタをExport</button>' : ''}</details>
      <details id="data-reset"><summary>データの初期化</summary>
      <section class="exchange-section"><h2>所持・育成データを初期化</h2><p>所持メンバー・スナップ・スタンプ、育成情報、進捗、ランク・TGWランク、アイテムとボーナスの手入力値、素材在庫を削除します。</p><button class="secondary danger" id="reset-button">所持・育成データを初期化</button></section>
      <section class="exchange-section"><h2>マスタデータを初期化</h2><p>マスタと内包されるランク定義を削除します。所持・育成データが参照している場合は、先にそちらを初期化してください。</p><button class="secondary danger" id="catalog-clear">マスタデータを初期化</button></section>
      </details></div>`;
  }

  function manualPage(): string {
    return `<section class="panel"><div class="panel-heading"><h2>表示値を入力</h2><button class="secondary small" id="manual-example">架空の例をセット</button></div>
      <form id="manual-form"><div class="form-grid">${field('manualP', 'Performance', '', 0)}${field('manualT', 'Technic', '', 0)}${field('manualV', 'Visual', '', 0)}
      ${field('manualA', '式の覚醒 A', 1)}${field('manualL', 'Live Lv', 1)}${field('manualG', '撃奏 Lv', 1)}${field('manualR', 'キャラクターランク', 1)}${field('manualTotalRankBonus', '総合ランクボーナス（各パラメータへの加算値）', '', 0)}
      <label class="field" for="manualItem"><span>バンドアイテム補正（%）</span><input type="number" id="manualItem" name="manualItem" min="0" step="0.1" value="0" required></label></div>
      <label class="check"><input type="checkbox" name="noSnap" id="noSnap" checked>スナップなし</label>
      <div class="form-grid manual-snap"><label class="field" for="snapP"><span>スナップ Performance（%）</span><input id="snapP" name="snapP" type="number" min="0" step="0.01" value="0"></label>
        <label class="field" for="snapT"><span>スナップ Technic（%）</span><input id="snapT" name="snapT" type="number" min="0" step="0.01" value="0"></label>
        <label class="field" for="snapV"><span>スナップ Visual（%）</span><input id="snapV" name="snapV" type="number" min="0" step="0.01" value="0"></label>${field('manualU', 'スナップ上限解放 U', 1)}</div>
      <button type="submit" class="primary">個別評価値を計算</button></form>
      <output id="manual-output" class="manual-output" aria-live="polite"></output><p class="muted">この計算は所持データの登録内容を変更しません。評価値式は観測範囲で検証した推定式です。</p></section>`;
  }
  function pageBody(): string {
    if (active === 'event') return '<div id="event-planner"></div>';
    try { return catalogIssues(master).length && ['members','snaps','stamps','progress','items','materials','inventory'].includes(active) ? missingCatalog() : active === 'rating' ? ratingPage() : active === 'members' ? membersPage() : active === 'snaps' ? snapsPage() : active === 'stamps' ? stampsMarkup(master,collection,stampFilters) : active === 'progress' ? progressPage() : active === 'items' ? itemsPage() : active === 'materials' ? (!allowWrites || !allowCatalogWrites ? '<section class="panel"><p>保存データを保護中のため必要素材を計算できません。JSON Import / Exportで復旧してください。</p></section>' : createMaterialsPage(master,collection,trainingSettings).html) : active === 'inventory' ? (inventoryView=createResourceInventoryView(master,collection,inventoryState)).html : active === 'exchange' ? exchangePage() : manualPage(); }
    catch (error) { return '<section class="panel"><h2>入力データを確認してください</h2><p role="alert">' + escape(errorMessage(error)) + '</p></section>'; }
  }
  const progressExpanded = new Map<string,boolean>();
  function render(): void {
    root.querySelectorAll<HTMLDetailsElement>('#progress-form details[data-progress-section]').forEach(d=>progressExpanded.set(d.dataset.progressSection!,d.open));
    noteListenerController.abort(); noteListenerController = new AbortController();
    flushAutosaves();
    const [title, description] = headings[active];
    root.innerHTML = `<header class="site-header"><div class="brand"><span class="brand-mark" aria-hidden="true">ON</span><div><strong>atsudori-tools</strong><small>${active === 'event' ? 'イベント周回プランナー' : 'バンド評価値'}</small></div></div>
      <div class="header-meta"><label class="theme-setting">表示 <select data-theme aria-label="表示テーマ"><option value="system">システム</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label><span class="save-state ${saved ? '' : 'unsaved'}" role="status">${saved ? 'ブラウザ内に保存' : '保存未完了'}</span></div></header>
      <div class="layout"><nav class="navigation" aria-label="メインメニュー">${tabs.map(([id, label]) => `<button data-tab="${id}" ${active === id ? 'class="active" aria-current="page"' : ''}>${label}${id === 'members' || id === 'snaps' ? `<span>${id === 'members' ? collection.members.length : collection.snaps.length}</span>` : ''}</button>`).join('')}</nav>
      <main class="${active === 'rating' ? 'rating-page' : active === 'progress' || active === 'items' ? 'progress-page' : ''}"><div class="page-heading">${active === 'rating' ? '' : `<div class="eyebrow">${active === 'event' ? 'EVENT PLANNER' : 'BAND RATING'}</div>`}<h1 tabindex="-1">${title}</h1>${active === 'rating' ? '' : `<p>${description}</p>`}</div>
      <div id="autosave-warning" class="alert error" role="alert" hidden></div>
      ${notice ? `<div class="alert ${notice.error ? 'error' : 'success'}" role="${notice.error ? 'alert' : 'status'}">${escape(notice.text)}</div>` : ''}
      ${pageBody()}
      <footer><p>非公式ツールです。ゲームの運営・開発元とは関係ありません。計算結果は推定式によるもので、ゲーム内の結果を保証しません。</p>
        <p><a href="https://github.com/morimori36/atsudori-tools/blob/main/docs/${active === 'event' ? 'event-planner' : 'calculation'}.md" target="_blank" rel="noreferrer">計算と未検証範囲</a> · <a href="https://github.com/morimori36/atsudori-tools" target="_blank" rel="noreferrer">ソース</a> · <a href="./THIRD_PARTY_NOTICES.txt">権利表示</a></p></footer></main></div>`;
    root.querySelectorAll<HTMLDetailsElement>('#progress-form details[data-progress-section]').forEach(d=>{d.open=progressExpanded.get(d.dataset.progressSection!)??false;});
    const themeSelect = root.querySelector<HTMLSelectElement>('[data-theme]')!;
    themeSelect.value = getTheme();
    themeSelect.addEventListener('change', () => setTheme(themeSelect.value));
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => {
      active = button.dataset.tab as Tab; notice = undefined; render();
      root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); root.querySelector('h1')?.scrollIntoView({ block: 'start' });
    }));
    root.querySelectorAll<HTMLInputElement>('input[name="rating-mode"]').forEach(input => input.addEventListener('change', () => {
      const expanded = [...root.querySelectorAll<HTMLDetailsElement>('.color-result')].map(d => ({ band: d.dataset.band, color: d.dataset.color, open: d.open }));
      ratingMode = input.value as typeof ratingMode;
      render();
      for (const state of expanded) {
        const details = root.querySelector<HTMLDetailsElement>(`.color-result[data-band="${state.band}"][data-color="${state.color}"]`);
        if (details) details.open = state.open;
      }
      root.querySelector<HTMLInputElement>(`input[name="rating-mode"][value="${ratingMode}"]`)?.focus();
    }));
    if (active === 'rating' || active === 'materials' || active === 'progress') bindTrainingSettings(root,trainingSettings);
    if (active === 'materials') bindMaterialCopy(root,()=>materialShortageText(master,collection,trainingSettings.current()));
    if (active === 'progress') characterExpView?.bind(root,refreshProgress);
    if (active === 'inventory') inventoryView?.bind(root, inventory=>{
      const previous=collection;
      try { persist({...collection,resourceInventory:inventory}); }
      catch (error) { collection=previous;storageMessage=errorMessage(error);saved=false; }
      if(!saved)collection=previous;
      syncSaveState();return saved;
    }, (id,save,immediate)=>{
      const key='inventory:'+id, previous=pendingSaves.get(key);
      if(previous)clearTimeout(previous.timer);
      const commit=()=>{pendingSaves.delete(key);save();syncSaveState();};
      if(immediate)commit();else pendingSaves.set(key,{timer:setTimeout(commit,350),save:commit});
      syncSaveState();
    });
    if (active === 'event') eventPlanner.mount(root.querySelector<HTMLElement>('#event-planner')!);
    if (active === 'exchange') conversionExport.mount(root.querySelector<HTMLElement>('#conversion-export')!);
    bindStamps(root,master,collection,stampFilters, ids => {
      const previous=collection;
      try { persist({...collection,ownedStampIds:ids}); }
      catch (error) { collection=previous;storageMessage=errorMessage(error);saved=false; }
      if (!saved) collection=previous;
      syncSaveState();return saved;
    });
    bindMembers(); bindSnaps(); bindProgress(); bindExchange(); bindManual(); bindNotes(); syncSaveState();
  }
  trainingSettings.subscribe(()=>{if(active==='progress')refreshProgress();else if(active==='rating'||active==='materials') preserveTrainingView(root,render);});
  function memberFormValue(form: HTMLFormElement): OwnedMember {
    const data = new FormData(form);
    const result: OwnedMember = { cardId: Number(data.get('cardId')), level: Number(data.get('memberLevel')),
      trainingStage: Number(data.get('trainingStage')), awakeningStage: Number(data.get('awakeningStage')),
      liveSkillLevel: Number(data.get('liveSkillLevel')), gekisouSkillLevel: Number(data.get('gekisouSkillLevel')) };
    return result;
  }
  function syncSaveState(): void {
    const state = root.querySelector<HTMLElement>('.save-state');
    if (active === 'event') {
      const eventState = eventPlanner.saveState();
      if (state) { state.textContent = eventState.label; state.classList.toggle('unsaved', eventState.unsaved); }
      return;
    }
    if (state) { state.textContent = !saved || !catalogSaved ? '保存未完了' : drafts.size || inventoryState.drafts.size || progressDraft.size ? '未保存の入力あり' : active === 'progress' || active === 'items' ? '保存済み' : '自動保存済み'; state.classList.toggle('unsaved', !saved || !catalogSaved || drafts.size > 0 || inventoryState.drafts.size > 0 || progressDraft.size > 0); }
    const warning = root.querySelector<HTMLElement>('#autosave-warning');
    if (warning) { warning.textContent = [catalogStorageMessage,storageMessage].filter(Boolean).join(' '); warning.hidden = !warning.textContent; }
    for (const kind of ['members', 'snaps'] as const) {
      const badge = root.querySelector(`[data-tab="${kind}"] span`);
      if (badge) badge.textContent = String(collection[kind].length);
    }
  }
  function bindCatalog(kind: 'members' | 'snaps'): void {
    const members = kind === 'members';
    if (active !== kind || !root.querySelector('[data-reset-filters]')) return;
    const filter = filters[kind];
    const cards = [...root.querySelectorAll<HTMLElement>('[data-catalog-id]')];
    const rows = members ? master.members : master.snaps;
    const owned = (id: number): boolean => members ? collection.members.some(m => m.cardId === id) : collection.snaps.some(s => s.supportCardId === id);
    const level = (id: number): number => (members ? collection.members.find(m => m.cardId === id) : collection.snaps.find(s => s.supportCardId === id))?.level ?? 0;
    const applyFilters = (): void => {
      let count = 0;
      cards.forEach(card => {
        const id = Number(card.dataset.catalogId); const row = rows.find(r => r.id === id)!;
        const ids = 'characterId' in row ? [row.characterId] : row.characterIds;
        const names = ids.map(id => master.characters.find(c => c.id === id)!);
        const text = [row.name, row.title, id, ...names.map(c => c.name)].join(' ').normalize('NFKC').toLocaleLowerCase('ja');
        card.hidden = !(text.includes(filter.query.trim().normalize('NFKC').toLocaleLowerCase('ja')) &&
          (!filter.band || names.some(c => c.bandId === Number(filter.band))) && (!filter.character || ids.includes(Number(filter.character))) &&
          (!filter.type || row.cardType === Number(filter.type)) && (!filter.rarity || row.rarity === Number(filter.rarity)) &&
          (!filter.skill || ('characterId' in row ? row.liveSkillCategoryIds : row.supportSkillCategoryIds)?.includes(Number(filter.skill))) &&
          (!filter.secondarySkill || ('characterId' in row ? row.gekisouSkillCategoryIds : row.gekisouSupportSkillCategoryIds)?.includes(Number(filter.secondarySkill))) &&
          (!filter.ownership || owned(id) === (filter.ownership === 'owned')));
        if (!card.hidden) count++;
      });
      cards.sort((a, b) => {
        const x = rows.find(r => r.id === Number(a.dataset.catalogId))!; const y = rows.find(r => r.id === Number(b.dataset.catalogId))!;
        return (filter.sort === 'name' ? x.name.localeCompare(y.name, 'ja') : filter.sort === 'rarity' ? y.rarity - x.rarity : filter.sort === 'level' ? level(y.id) - level(x.id) : filter.sort === 'owned' ? Number(owned(y.id)) - Number(owned(x.id)) : 0) || x.id - y.id;
      }).forEach(card => root.querySelector('.catalog-grid')!.append(card));
      root.querySelector('.catalog-count')!.textContent = `表示 ${count} / 全 ${rows.length}種類 · 所持 ${members ? collection.members.length : collection.snaps.length}枚`;
      root.querySelector<HTMLElement>('.catalog-empty')!.hidden = count !== 0;
    };
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-filter]').forEach(input => input.addEventListener(input.type === 'search' ? 'input' : 'change', () => {
      filter[input.dataset.filter as keyof typeof filter] = input.value; applyFilters();
    }));
    root.querySelector('[data-reset-filters]')!.addEventListener('click', () => {
      Object.assign(filter, { query: '', band: '', character: '', type: '', rarity: '', ownership: '', skill: '', secondarySkill: '', sort: 'id' });
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-filter]').forEach(input => {
        const value = filter[input.dataset.filter as keyof typeof filter];
        if (input instanceof HTMLInputElement && input.type === 'radio') input.checked = input.value === value; else input.value = value;
      }); applyFilters();
    });
    cards.forEach(card => {
      const id = Number(card.dataset.catalogId); const form = card.querySelector<HTMLFormElement>('form')!;
      const input = (name: string): HTMLInputElement => form.elements.namedItem(name) as HTMLInputElement;
      const update = (): void => {
        const enabled = input('owned').checked;
        const ownershipButton = card.querySelector<HTMLButtonElement>('[data-ownership-toggle]')!;
        ownershipButton.setAttribute('aria-pressed', String(enabled));
        card.querySelector('[data-owned-label]')!.textContent = enabled ? '✓ 所持' : '未所持';
        card.classList.toggle('is-owned', enabled);
        const growth = form.querySelector<HTMLFieldSetElement>('fieldset')!; growth.disabled = !enabled; growth.hidden = !enabled;
        const preview = form.querySelector<HTMLElement>('[data-preview]')!;
        if (!enabled) { preview.textContent = '未所持のカードは計算に含まれません。'; return; }
        if (members) {
          const row = master.members.find(m => m.id === id)!;
          const cap = master.memberLevelLimits.find(l => l.rarity === row.rarity && l.trainingStage === Number(input('trainingStage').value))?.limitLevel;
          input('memberLevel').value = cap === undefined ? '' : String(cap);
          const storedLevel = collection.members.find(m => m.cardId === id)?.level;
          form.querySelector('[data-level-output]')!.textContent = cap === undefined ? '特訓を選ぶとLvが決まります' : `Lv ${cap} · 特訓に連動${storedLevel !== undefined && storedLevel !== cap ? `（保存Lv ${storedLevel}・編集時に更新）` : ''}`;
          try { const display = deriveMemberDisplay(master, memberFormValue(form)).displayedStats;
            preview.textContent = `育成3項のP/T/V：${number(display.performance)} / ${number(display.technic)} / ${number(display.visual)} · Lv上限 ${cap}`;
          } catch { preview.textContent = '育成状況を入力してください。' + (cap === undefined ? '' : ' Lv上限 ' + cap); }
        } else {
          const row = master.snaps.find(s => s.id === id)!;
          const rank = Number(input('snapRank').value); const cap = master.snapRanks.find(r => r.group === row.rankGroup && r.rank === rank)?.limitLevel;
          input('snapLevel').value = cap === undefined ? '' : String(cap);
          const storedLevel = collection.snaps.find(s => s.supportCardId === id)?.level;
          form.querySelector('[data-level-output]')!.textContent = cap === undefined ? '上限解放を選ぶとLvが決まります' : `Lv ${cap} · 上限解放に連動${storedLevel !== undefined && storedLevel !== cap ? `（保存Lv ${storedLevel}・編集時に更新）` : ''}`;
          try { const percent = deriveSnapDisplay(master, { supportCardId: id, level: Number(input('snapLevel').value), rank }).percentBp;
            preview.textContent = `P/T/V：${pct(percent.performance)} / ${pct(percent.technic)} / ${pct(percent.visual)}% · Lv上限 ${cap}`;
          } catch { preview.textContent = '育成状況を入力してください。' + (cap === undefined ? '' : ' Lv上限 ' + cap); }
        }
      };
      const key = kind + id;
      const state = form.querySelector<HTMLElement>('[data-draft-state]')!;
      const save = (): void => {
        const pending = pendingSaves.get(key); if (pending) clearTimeout(pending.timer); pendingSaves.delete(key);
        try {
          if (!form.checkValidity()) {
            const invalid = form.querySelector<HTMLInputElement>('input:invalid');
            state.textContent = `${invalid?.closest('.stage-field')?.querySelector('legend')?.textContent ?? invalid?.labels?.[0]?.textContent?.trim() ?? '育成状況'}を確認してください · 未保存`;
            state.classList.add('error-text'); syncSaveState(); return;
          }
          if (members) {
            const rest = collection.members.filter(m => m.cardId !== id);
            persist({ ...collection, members: input('owned').checked ? [...rest, memberFormValue(form)] : rest });
          } else {
            const rest = collection.snaps.filter(s => s.supportCardId !== id);
            persist({ ...collection, snaps: input('owned').checked ? [...rest, { supportCardId: id, level: Number(input('snapLevel').value), rank: Number(input('snapRank').value) }] : rest });
          }
          drafts.delete(key); update(); state.textContent = ''; state.classList.remove('error-text');
          card.classList.toggle('is-owned', input('owned').checked);
          // Do not reorder/hide the card being edited. Filters refresh on the next filter action.
          root.querySelector('.catalog-count')!.textContent = `表示 ${cards.filter(c => !c.hidden).length} / 全 ${rows.length}種類 · 所持 ${collection[kind].length}枚`;
        } catch (error) { state.textContent = errorMessage(error) + ' · 未保存'; state.classList.add('error-text'); }
        syncSaveState();
      };
      const capture = (): void => {
        update();
        const draft: Record<string, string> = {};
        form.querySelectorAll<HTMLInputElement>('input').forEach(i => { if (!['checkbox', 'radio'].includes(i.type) || i.checked) draft[i.name] = i.value; });
        drafts.set(key, draft); update(); state.textContent = '入力中…'; state.classList.remove('error-text'); syncSaveState();
      };
      form.addEventListener('input', () => {
        capture(); const previous = pendingSaves.get(key); if (previous) clearTimeout(previous.timer);
        pendingSaves.set(key, { timer: setTimeout(save, 350), save });
      });
      form.addEventListener('change', () => { capture(); save(); });
      form.addEventListener('submit', event => { event.preventDefault(); save(); });
      const toggleOwnership = (): void => {
        input('owned').checked = !input('owned').checked;
        if (input('owned').checked) {
          // Stage 1 is the application's explicit input starting point, not an observed universal game value.
          form.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach(radio => { radio.checked = radio.value === '1'; });
        }
        capture(); save();
      };
      card.querySelector('[data-ownership-toggle]')!.addEventListener('click', toggleOwnership);
      card.addEventListener('click', event => {
        const target = event.target as Element;
        if (target.closest('button, form, input, label, select, summary, details, a')) return;
        toggleOwnership();
      });
      update();
    });
    applyFilters();
  }
  function bindMembers(): void { bindCatalog('members'); }
  function bindSnaps(): void { bindCatalog('snaps'); }
  function refreshProgress(): void {
    const restore=captureProgressView(), x=window.scrollX, y=window.scrollY;
    render();restore();window.scrollTo(x,y);
  }
  function captureProgressView(): () => void {
    const positions = Array.from(root.querySelectorAll<HTMLElement>('[data-progress-scroll], .progress-targets')).map(el => el.scrollLeft);
    const focused=document.activeElement instanceof HTMLElement&&root.contains(document.activeElement)?document.activeElement:undefined;
    const focusId=focused?.id;
    const expanded = Array.from(root.querySelectorAll<HTMLDetailsElement>('#progress-form details[open]')).map(el => el.dataset.progressSection);
    return () => {
      root.querySelectorAll<HTMLElement>('[data-progress-scroll], .progress-targets').forEach((el, i) => { el.scrollLeft = positions[i] ?? 0; });
      root.querySelectorAll<HTMLDetailsElement>('#progress-form details').forEach(el => { if(expanded.includes(el.dataset.progressSection))el.open=true; });
      if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
    };
  }

  function bindProgress(): void {
    const form = root.querySelector<HTMLFormElement>('#progress-form'); if (!form) return;
    const inScope = (name: string): boolean => name.startsWith('item-') === (form.dataset.editScope === 'items');
    const scopedDrafts = () => [...progressDraft].filter(([name]) => inScope(name));
    const readValues = (): Collection => {
      const characterRanks = { ...collection.characterRanks };
      const characterProgress = { ...collection.characterProgress };
      const bandItems = { ...collection.bandItems };
      for (const [name, value] of scopedDrafts()) {
        const rank = /^rank-(\d+)$/.exec(name), item = /^item-(\d+)$/.exec(name), progress = /^progress-(\d+)-(.+)$/.exec(name);
        if (rank) { if (value.trim()) characterRanks[Number(rank[1])] = Number(value); else delete characterRanks[Number(rank[1])]; }
        if (item) bandItems[Number(item[1])] = Number(value) || null;
        if (progress) {
          const id = Number(progress[1]), key = progress[2] as keyof CharacterProgress;
          const entry = { ...characterProgress[id] };
          if (value.trim()) entry[key] = Number(value); else delete entry[key];
          if (Object.keys(entry).length) characterProgress[id] = entry; else delete characterProgress[id];
        }
      }
      if (form.dataset.editScope === 'items') return { ...collection, bandItems };
      const { totalRankBonus: previousBonus, tgwRank: previousTgw, ...base } = collection;
      const tgwDraft = inScope('tgwRank') ? progressDraft.get('tgwRank') : undefined;
      const tgwRank = tgwDraft === undefined ? previousTgw : tgwDraft.trim() === '' ? undefined : Number(tgwDraft);
      const bonus = inScope('totalRankBonus') ? progressDraft.get('totalRankBonus') : undefined;
      return { ...base, characterRanks, characterProgress, bandItems, ...(tgwRank === undefined ? {} : {tgwRank}), ...((bonus === undefined ? previousBonus : bonus.trim() === '' ? undefined : Number(bonus)) === undefined ? {} : { totalRankBonus: bonus === undefined ? previousBonus : Number(bonus) }) };
    };
    const update = (): void => {
      const next = readValues();
      const dirty = scopedDrafts().length > 0;
      form.classList.toggle('is-dirty', dirty);
      form.querySelector('[data-progress-state]')!.textContent = !saved ? 'ブラウザ保存未完了' : dirty ? '未保存の変更あり' : '変更後は保存してください';
      syncSaveState();
      if (form.dataset.editScope === 'items') return;
      const previewRanks=estimateCharacterRanks(master,next,rankRules.current());
      for (const c of master.characters) {
        const row = form.querySelector<HTMLElement>(`[data-character-rank="${c.id}"]`);
        if (!row) continue;
        const input = form.elements.namedItem(`rank-${c.id}`) as HTMLInputElement;
        row.querySelector<HTMLButtonElement>('[data-reset-rank]')!.disabled = input.value === '';
        // Do not replace a partially typed or invalid value with a guessed rank.
        if (!Array.from(row.querySelectorAll<HTMLInputElement>('input')).every(i => i.validity.valid)) continue;
        const rank = previewRanks.find(r=>r.id===c.id)!;
        row.querySelector('[data-estimated-rank]')!.textContent = String(rank.estimatedRank??'—');
        row.querySelector('[data-rank-exp]')!.textContent = String(rank.exp??'—');
        row.querySelector('[data-effective-rank]')!.textContent = String(rank.effectiveRank??'未算出');
        row.querySelector('[data-rank-source]')!.textContent = rank.overrideRank === undefined ? rank.estimatedRank===null?'定義未登録・不一致':'自動推定' : '手動上書き中';
        row.querySelector('[data-rank-reason]')!.textContent = rankReason(rank);
        row.querySelector('[data-missing-progress]')!.textContent = rank.missingProgress.length ? '進捗に未入力あり' : '';
        row.querySelector('[data-rank-breakdown]')!.innerHTML = rankBreakdown(rank);
      }
      if (Array.from(form.querySelectorAll<HTMLInputElement>('input')).every(i => i.validity.valid)) {
        form.querySelector('[data-total-character-rank] strong')!.textContent = sumCharacterRanks(previewRanks)?.toLocaleString('ja-JP')??'未算出';
        const bonus=resolveTotalRankBonus(previewRanks,next,rankRules.current());
        form.querySelector('[data-total-rank-bonus]')!.textContent = `使用する加算値：${bonus.bonus===null?'未設定':'+'+bonus.bonus}（${bonus.source==='manual'?'手入力':bonus.source==='rules'?'ランク定義から算出':'評価値は保留'}）`;
      }
    };
    form.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (input.name) progressDraft.set(input.name, input.value);
      update();
    });
    form.querySelectorAll<HTMLButtonElement>('[data-progress-band]').forEach(button => button.addEventListener('click', () => {
      if (!form.reportValidity()) return;
      const restore = captureProgressView();
      progressBand = Number(button.dataset.progressBand); render(); restore();
      root.querySelector<HTMLButtonElement>(`[data-progress-band="${progressBand}"]`)?.focus({ preventScroll: true });
    }));
    update();
    form.querySelectorAll<HTMLButtonElement>('[data-reset-rank]').forEach(button => button.addEventListener('click', () => {
      const input = form.elements.namedItem(`rank-${button.dataset.resetRank}`) as HTMLInputElement;
      input.value = ''; progressDraft.set(input.name, ''); update(); input.focus();
    }));
    form.addEventListener('invalid', event => {
      const target = event.target as HTMLElement;
      const details = target.closest('details'); if (details) details.open = true;
    }, true);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const restore = captureProgressView();
      try {
        const previous = collection;
        persist(readValues());
        if (saved) {
          for (const [name] of scopedDrafts()) progressDraft.delete(name);
          notice = { error: false, text: form.dataset.editScope === 'items' ? 'バンドアイテムを反映しました' : 'キャラランクを反映しました' };
        } else {
          // A failed save must not leak this screen's draft into another save.
          collection = previous;
          notice = undefined;
        }
      } catch (error) { notice = { error: true, text: errorMessage(error) }; }
      render();
      restore();
    });
  }

  function bindExchange(): void {
    root.querySelector('#catalog-export')?.addEventListener('click', () => run(() => download(exportCatalog(master), 'atsudori-catalog.json'), 'マスタJSONをExportしました'));
    root.querySelector('#catalog-original')?.addEventListener('click', () => download(damagedCatalog!, 'atsudori-original-catalog.json'));
    root.querySelector<HTMLInputElement>('#catalog-import')?.addEventListener('change', async event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
      input.value = ''; const readId = ++catalogReadId;
      notice = { error: false, text: 'マスタを検証中…' }; render();
      try {
        if (file.size > CATALOG_LIMIT) throw new Error('マスタJSONの上限は10MiBです');
        const text = await file.text(); if (readId !== catalogReadId) return;
        const next = importCatalog(text);
        run(() => replaceCatalog(next), 'マスタをImportしました');
      } catch (error) { if (readId === catalogReadId) run(() => { throw error; }); }
    });
    root.querySelector('#catalog-clear')?.addEventListener('click', () => {
      if (!window.confirm('マスタと内包するランク定義を空にします。必要なJSONをExport済みですか？ 所持参照が残っていれば拒否します。')) return;
      run(() => {
        try { if (!allowWrites) throw new Error('保存所持データを保護中です'); validateCollection(collection, emptyCatalog()); }
        catch { throw new Error('所持・育成データがマスタを参照しています。必要なJSONをExportし、先に「所持・育成データを初期化」を実行してください。'); }
        replaceCatalog(emptyCatalog());
      }, 'マスタデータを初期化しました');
    });
    root.querySelector('#export-button')?.addEventListener('click', () => run(() => download(exportCollection(collection, master), 'atsudori-collection.json'), '所持JSONをExportしました'));
    root.querySelector('#damaged-backup')?.addEventListener('click', () => download(damagedBackup!, 'atsudori-original-storage.json'));
    root.querySelector<HTMLInputElement>('#import-file')?.addEventListener('change', async event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
      (event.target as HTMLInputElement).value = '';
      const readId = ++importReadId;
      notice = { error: false, text: '所持データを検証中…' }; render();
      try { if (file.size > 5 * 1024 * 1024) throw new Error('JSONが大きすぎます（上限5MB）');
        const text = await file.text(); if (readId !== importReadId) return;
        const next = prepareCollectionImport(importCollection(text, master), collection, master, true);
        const result = saveCollection(storage, next, master);
        if (result.status === 'failed') throw new Error('所持データを保存できません。' + result.error);
        cancelAutosaves(); collection = next; allowWrites = true; saved = true; storageMessage = '';
        drafts.clear(); inventoryState.drafts.clear(); progressDraft.clear();
        notice = { error: false, text: '所持データをImportしました' };
      } catch (error) { if (readId !== importReadId) return; notice = { error: true, text: errorMessage(error) }; }
      render();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-file]').forEach(button => button.addEventListener('click', () => root.querySelector<HTMLInputElement>('#' + button.dataset.file)?.click()));
    root.querySelector('#reset-button')?.addEventListener('click', () => { if (!window.confirm('登録内容を空にします。必要なJSONをExport済みですか？')) return;
      run(() => {
        const next = emptyCollection(master), result = saveCollection(storage, next, master);
        if (result.status === 'failed') throw new Error('所持データを保存できません。' + result.error);
        importReadId++; catalogReadId++; cancelAutosaves();
        allowWrites = true; collection = next; saved = true; storageMessage = '';
        drafts.clear(); inventoryState.drafts.clear(); progressDraft.clear();
      }, '登録内容を初期化しました');
    });
  }
  function bindManual(): void {
    const form = root.querySelector<HTMLFormElement>('#manual-form'); if (!form) return;
    const noSnap = form.querySelector<HTMLInputElement>('#noSnap')!;
    const toggle = (): void => { form.querySelectorAll<HTMLInputElement>('.manual-snap input').forEach(input => { input.disabled = noSnap.checked; input.required = !noSnap.checked; }); };
    noSnap.addEventListener('change', toggle); toggle();
    root.querySelector('#manual-example')!.addEventListener('click', () => {
      const example: Record<string, number> = { manualP: 101, manualT: 202, manualV: 303, manualA: 2, manualL: 3, manualG: 1, manualR: 7,
        manualTotalRankBonus: 50, manualItem: 1.3, snapP: 3.21, snapT: 4.56, snapV: 7.89, manualU: 2 };
      Object.entries(example).forEach(([key, value]) => { form.querySelector<HTMLInputElement>(`#${key}`)!.value = String(value); }); noSnap.checked = false; toggle();
    });
    form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); const value = (key: string): number => Number(data.get(key));
      try {
        const stats: Stats = { performance: value('manualP'), technic: value('manualT'), visual: value('manualV') };
        const input: RatingInput = { memberDisplayedStats: stats, awakeLevel: value('manualA'), liveSkillLevel: value('manualL'), gekisouSkillLevel: value('manualG'),
          characterRank: value('manualR'), totalRankBonus: value('manualTotalRankBonus'), bandItemTenthPercent: fixed(data.get('manualItem'), 1, 'item補正'), snapLimitBreak: noSnap.checked ? 0 : value('manualU'),
          snapPercentBp: noSnap.checked ? { performance: 0, technic: 0, visual: 0 } : { performance: fixed(data.get('snapP'), 2, 'スナップ P'), technic: fixed(data.get('snapT'), 2, 'スナップ T'), visual: fixed(data.get('snapV'), 2, 'スナップ V') } };
        const result = calculateRating(input);
        root.querySelector('#manual-output')!.innerHTML = `<span>個別バンド評価値</span><strong>${number(result.bandRating)}</strong><p>B ${number(result.memberBase)} · K ${(result.snapMultiplierBp / 10000).toFixed(4)}</p>`;
      } catch (error) { root.querySelector('#manual-output')!.innerHTML = `<p class="error-text">${escape(errorMessage(error))}</p>`; }
    });
  }
  window.addEventListener('pagehide', flushAutosaves);
  render();
}
