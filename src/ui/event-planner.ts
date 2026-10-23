import { calculateEventPlans, challengeYield, normalYield } from '../domain/event-planner/calculate';
import type { Plan, PlannerResult } from '../domain/event-planner/calculate';
import { candidateName, CHALLENGE_RANKS, CP_UNIT, defaultEventInput, defaultRankBases, MAX_CANDIDATES, MAX_CP_PER_CHALLENGE, MAX_SEARCH_UNITS, NORMAL_RANKS } from '../domain/event-planner/model';
import type { EventPlannerInput } from '../domain/event-planner/model';
import { EVENT_JSON_LIMIT, exportEventInput, importEventInput, validateEventInput } from '../domain/event-planner/validate';
import { loadEventInput, saveEventInput } from '../storage/event-planner';
import type { EventStorage } from '../storage/event-planner';

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number): string => value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
const inputValue = (value: number): string => Number.isFinite(value) ? String(value) : '';
const message = (error: unknown): string => error instanceof Error ? error.message : '入力を確認してください';
function numeric(label: string, value: number, attributes: string, min = 0, step = '1', max?: number): string {
  return `<label class="field"><span>${label}</span><input type="number" inputmode="${step === '1' ? 'numeric' : 'decimal'}" min="${min}" ${max === undefined ? '' : `max="${max}"`} step="${step}" value="${inputValue(value)}" ${attributes} required></label>`;
}
function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createEventPlanner(storage: EventStorage | undefined, onSaveState: () => void) {
  const loaded = loadEventInput(storage);
  let input = loaded.status === 'loaded' ? loaded.input : defaultEventInput();
  let allowWrites = loaded.status !== 'invalid';
  let saved = loaded.status === 'loaded';
  let changed = false;
  let draftInvalid = false;
  let host: HTMLElement;
  let pendingImport: EventPlannerInput | undefined;
  let readId = 0;
  let importMessage = '';
  let actionMessage = '';
  let saveMessage = loaded.status === 'unavailable' ? 'ブラウザ保存を利用できません。入力後にJSONをExportしてください。' : '';
  const damaged = loaded.status === 'invalid' ? loaded.raw : undefined;

  function saveState(): { label: string; unsaved: boolean } {
    return { label: !allowWrites ? '元JSONを保護中' : draftInvalid ? '未保存の入力あり' : saved ? '自動保存済み' : changed ? '保存未完了' : '初期値（未保存）', unsaved: !saved || draftInvalid || !allowWrites };
  }
  function candidateCards(kind: 'normal' | 'challenge'): string {
    const normal = kind === 'normal', label = normal ? '通常' : 'チャレンジ';
    return `<section class="panel event-candidates" data-candidates="${kind}"><div class="panel-heading"><div><h2>${label}ライブ候補</h2><p>最大5件。チェックした候補を比較します。</p></div>
      <button type="button" class="secondary small" data-add="${kind}" ${input[kind].length >= MAX_CANDIDATES ? 'disabled' : ''}>${label}候補を追加</button></div>
      <div class="event-card-list">${input[kind].map((candidate, index) => `<fieldset class="event-card ${candidate.enabled ? '' : 'is-disabled'}" data-kind="${kind}" data-index="${index}">
        <legend>${label}候補${index + 1}</legend><div class="event-card-actions"><label class="check"><input type="checkbox" data-candidate-field="enabled" ${candidate.enabled ? 'checked' : ''}>使用する</label>
        <button type="button" class="text-button danger" data-remove="${kind}" data-index="${index}" aria-label="${label}候補${index + 1}を削除">削除</button></div>
        <label class="field"><span>候補名</span><input type="text" data-candidate-field="name" maxlength="200" value="${escape(candidate.name)}" placeholder="${label}候補${index + 1}"></label>
        <div class="event-two-fields"><label class="field"><span>ランク</span><select data-candidate-field="rank">${(normal ? NORMAL_RANKS : CHALLENGE_RANKS).map(rank => `<option ${rank === candidate.rank ? 'selected' : ''}>${rank}</option>`).join('')}</select></label>
        ${numeric('イベントボーナス（+%）', candidate.bonus, 'data-candidate-field="bonus"', 0, '0.01')}</div>
        <p class="preview-line" data-yield>—</p></fieldset>`).join('') || '<p class="muted">候補がありません。追加して計算を始めてください。</p>'}</div></section>`;
  }
  function settings(): string {
    return `<details class="panel event-settings"><summary>ランク基準・探索上限を設定</summary><p class="muted">CP単位は${CP_UNIT}、チャレンジ1回の最大消費は${number(MAX_CP_PER_CHALLENGE)}CPです。</p>
      ${numeric('探索するチャレンジ消費CP単位上限', input.maxUnits, 'data-common="maxUnits"', 0, '1', MAX_SEARCH_UNITS)}
      <p class="muted">0〜${number(MAX_SEARCH_UNITS)}単位まで設定できます。200単位なら合計40,000CPまで探索します。</p>
      <h3>通常ライブ（倍率1）</h3><div class="event-base-list">${NORMAL_RANKS.map(rank => `<fieldset data-base-kind="normal" data-rank="${rank}"><legend>${rank}</legend><div class="event-two-fields">
        ${numeric('基本イベントpt', input.bases.normal[rank].pt, 'data-base-field="pt"')}${numeric('基本CP', input.bases.normal[rank].cp, 'data-base-field="cp"')}</div></fieldset>`).join('')}</div>
      <h3>チャレンジライブ（200CPあたり）</h3><div class="event-base-list">${CHALLENGE_RANKS.map(rank => `<fieldset data-base-kind="challenge" data-rank="${rank}"><legend>${rank}</legend>
        ${numeric('基本イベントpt', input.bases.challenge[rank].pt, 'data-base-field="pt"')}</fieldset>`).join('')}</div>
      <button type="button" class="secondary" data-reset-bases>ランク基準を初期値へ戻す</button></details>`;
  }
  function backup(): string {
    return `<section class="panel event-backup"><h2>周回プランのImport / Export</h2><p class="muted">候補・共通条件・ランク基準をJSONで保存できます。</p>
      <div class="event-backup-actions"><button type="button" class="secondary" data-export-event>入力値をJSON Export</button>
      ${damaged !== undefined && !allowWrites ? '<button type="button" class="secondary" data-export-damaged>保護中の元JSONをExport</button><button type="button" class="secondary danger" data-recover-event>初期値で復旧</button>' : ''}</div>
      <label class="file-label">周回プランJSONをImport（64KiBまで）<input type="file" accept=".json,application/json" data-import-event></label>
      <div data-import-preview></div><p data-action-message role="status"></p></section>`;
  }
  function planNames(plan: Pick<Plan, 'normalIndex' | 'challengeIndex'>): { normal: string; challenge: string } {
    const n = input.normal[plan.normalIndex]!, c = input.challenge[plan.challengeIndex]!;
    return {
      normal: `${candidateName(n, 'normal', plan.normalIndex)}（${n.rank}・+${number(n.bonus)}%）`,
      challenge: `${candidateName(c, 'challenge', plan.challengeIndex)}（${c.rank}・+${number(c.bonus)}%）`,
    };
  }
  function metrics(plan: Plan): string {
    return `<dl class="event-metrics"><div><dt>通常ライブ</dt><dd>${number(plan.normalRuns)}回</dd></div><div><dt>チャレンジライブ</dt><dd>${number(plan.challengeRuns)}回</dd></div>
      <div><dt>使用CP</dt><dd>${number(plan.usedCP)}</dd></div><div><dt>残CP</dt><dd>${number(plan.remainingCP)}</dd></div><div><dt>到達イベントpt</dt><dd>${number(plan.reachedPt)}</dd></div><div><dt>推定所要時間</dt><dd>${number(plan.minutes)}分</dd></div></dl>`;
  }
  function comparison(plan: Plan, index: number): string {
    const names = planNames(plan);
    return `<li><details><summary><span>${index + 1}. ${escape(names.normal)}<br>＋ ${escape(names.challenge)}</span><strong>${number(plan.totalRuns)}<small>回</small></strong></summary>${metrics(plan)}<p class="muted">チャレンジ消費 ${number(plan.units)}単位（${number(plan.usedCP)}CP）</p></details></li>`;
  }
  function resultsMarkup(result: PlannerResult): string {
    const best = result.best;
    const scope = `<p class="muted event-search-scope">探索済み：0〜${number(result.searched.maxUnits)}単位（合計0〜${number(result.searched.maxUnits * CP_UNIT)}CP）、${result.searched.pairCount}ペア・${number(result.searched.states)}通り。この範囲での最短結果です。上限を超える解は保証しません。</p>`;
    if (!result.pairs.length) return `<section class="panel"><h2>候補を選んでください</h2><p>通常とチャレンジの候補をそれぞれ1件以上「使用する」にしてください。チャレンジなし（0回）の計画も比較します。</p>${scope}</section>`;
    const failed = result.pairs.filter(pair => pair.status === 'unreachable');
    return `${best ? (() => {
      const names = planNames(best);
      return `<section class="panel event-best" aria-label="最短ルート"><div class="panel-heading"><div><h2>探索範囲での最短ルート</h2><p>${input.currentPt >= input.targetPt ? '目標は達成済みです。追加の周回は不要です。' : '通常ライブでCPを確保してからチャレンジライブへ。'}</p></div><div class="event-run-total"><strong data-best-runs>${number(best.totalRuns)}</strong><span>総周回数</span></div></div>
        <p class="event-route-names"><span>通常：${escape(names.normal)}</span><span>チャレンジ：${escape(names.challenge)}</span></p>${metrics(best)}
        <ol class="event-route"><li>通常ライブを${number(best.normalRuns)}回プレイ。</li><li>${best.challengeRuns ? `チャレンジライブを${number(best.challengeRuns)}回プレイ。消費内訳：${best.cpBreakdown.map(part => `${number(part.cp)}CP × ${number(part.runs)}回`).join('、')}。` : 'チャレンジライブは不要です。'}</li></ol>
        <p class="muted">チャレンジ消費 ${number(best.units)}単位。1計画では通常・チャレンジ各1候補だけを使用します。</p>${scope}</section>`;
    })() : `<section class="panel"><h2>計算できる組み合わせがありません</h2><p>目標・現在CP・ランク基準・探索上限を確認してください。</p>${scope}</section>`}
      <section class="panel event-comparison"><h2>上位${Math.min(10, result.ranked.length)}パターン</h2><p class="muted">候補ペアごとの最小周回数を比較。同じ周回数のペアは登録順です。</p>
      <ol class="event-ranking">${result.ranked.slice(0, 10).map(comparison).join('')}</ol>
      <details class="event-all-pairs"><summary>全${result.pairs.length}ペアの比較結果</summary><ol class="event-ranking">${result.ranked.map(comparison).join('')}</ol>
        ${failed.map(pair => { if (pair.status !== 'unreachable') return ''; const names = planNames(pair); return `<p class="alert error">${escape(names.normal)} ＋ ${escape(names.challenge)}：${escape(pair.reason)}</p>`; }).join('')}</details></section>`;
  }
  function updateImportPreview(): void {
    const preview = host.querySelector<HTMLElement>('[data-import-preview]');
    if (!preview) return;
    preview.innerHTML = `${importMessage ? `<p role="alert" class="error-text">${escape(importMessage)}</p>` : ''}${pendingImport ? `<div class="import-preview"><p>通常${pendingImport.normal.length}件・チャレンジ${pendingImport.challenge.length}件の入力を読み込みます。</p><button type="button" class="primary" data-apply-event>この入力に置き換える</button></div>` : ''}`;
    preview.querySelector('[data-apply-event]')?.addEventListener('click', () => {
      input = pendingImport!; pendingImport = undefined; allowWrites = true; changed = true; saved = false;
      actionMessage = '入力を置き換えました。'; render(); refresh(true);
    });
  }
  function refresh(persist: boolean): void {
    const warning = host.querySelector<HTMLElement>('[data-event-storage-warning]')!;
    const output = host.querySelector<HTMLElement>('[data-event-results]')!;
    const comparisons = host.querySelector<HTMLElement>('[data-event-comparisons]')!;
    comparisons.replaceChildren();
    draftInvalid = false;
    try {
      const valid = validateEventInput(input);
      if (persist) {
        changed = true;
        saved = allowWrites && saveEventInput(storage, valid);
        saveMessage = saved ? '' : allowWrites ? 'ブラウザに保存できませんでした。JSONをExportしてください。' : '';
      }
      output.innerHTML = resultsMarkup(calculateEventPlans(valid));
      const comparison = output.querySelector('.event-comparison');
      if (comparison) comparisons.append(comparison);
    } catch (error) {
      try { validateEventInput(input); } catch { draftInvalid = true; }
      output.innerHTML = `<section class="panel"><h2>入力を確認してください</h2><p class="error-text" role="alert">${escape(message(error))}</p></section>`;
    }
    host.querySelectorAll<HTMLElement>('[data-kind]').forEach(card => {
      const kind = card.dataset.kind as 'normal' | 'challenge', index = Number(card.dataset.index);
      const line = card.querySelector<HTMLElement>('[data-yield]')!;
      card.classList.toggle('is-disabled', !input[kind][index]!.enabled);
      try {
        validateEventInput(input);
        if (kind === 'normal') { const gain = normalYield(input, input.normal[index]!); line.textContent = `1回：${number(gain.pt)}pt / ${number(gain.cp)}CP`; }
        else { const gain = challengeYield(input, input.challenge[index]!); line.textContent = `200CP：${number(gain.pt)}pt / 1,600CP：${number(gain.maxPt)}pt`; }
      } catch { line.textContent = '入力値を確認してください'; }
    });
    warning.textContent = !allowWrites ? '保存JSONが破損しているか、未対応の形式です。元JSONを保護中です。下のImport / Exportから元JSONを退避し、正しいJSONへの置き換えか初期値で復旧を選んでください。' : saveMessage;
    warning.hidden = !warning.textContent;
    host.querySelector<HTMLElement>('[data-action-message]')!.textContent = actionMessage;
    onSaveState();
  }
  function edit(control: HTMLInputElement | HTMLSelectElement): void {
    const value = control instanceof HTMLInputElement && control.type === 'number' ? control.valueAsNumber : control.value;
    const common = control.dataset.common as 'targetPt' | 'currentPt' | 'currentCP' | 'normalMultiplier' | 'minutesPerRun' | 'maxUnits' | undefined;
    if (common) input[common] = value as number;
    const field = control.dataset.candidateField;
    const card = control.closest<HTMLElement>('[data-kind]');
    if (card && field) {
      const candidate = input[card.dataset.kind as 'normal' | 'challenge'][Number(card.dataset.index)]!;
      if (field === 'enabled') candidate.enabled = (control as HTMLInputElement).checked;
      if (field === 'name') candidate.name = String(value);
      if (field === 'rank') candidate.rank = String(value) as typeof candidate.rank;
      if (field === 'bonus') candidate.bonus = value as number;
    }
    const base = control.closest<HTMLElement>('[data-base-kind]');
    if (base && control.dataset.baseField) {
      if (base.dataset.baseKind === 'normal') input.bases.normal[base.dataset.rank as typeof NORMAL_RANKS[number]][control.dataset.baseField as 'pt' | 'cp'] = value as number;
      else input.bases.challenge[base.dataset.rank as typeof CHALLENGE_RANKS[number]].pt = value as number;
    }
    changed = true; actionMessage = ''; refresh(true);
  }
  function render(): void {
    readId++;
    host.innerHTML = `<div data-event-storage-warning class="alert error" role="alert" hidden></div><div data-event-results aria-live="polite" aria-atomic="true"></div>
      <section class="panel"><h2>共通条件</h2><div class="form-grid event-common">
      ${numeric('目標イベントpt', input.targetPt, 'data-common="targetPt"')}${numeric('現在イベントpt', input.currentPt, 'data-common="currentPt"')}
      ${numeric('現在CP', input.currentCP, 'data-common="currentCP"')}${numeric('通常ライブ倍率', input.normalMultiplier, 'data-common="normalMultiplier"', 1)}
      ${numeric('1周あたり時間（分）', input.minutesPerRun, 'data-common="minutesPerRun"', 0.01, '0.01')}
      </div></section><div class="event-candidate-columns">${candidateCards('normal')}${candidateCards('challenge')}</div><div data-event-comparisons></div>${settings()}${backup()}`;
    host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-common], [data-candidate-field], [data-base-field]').forEach(control => control.addEventListener('input', () => edit(control)));
    host.querySelectorAll<HTMLElement>('[data-add]').forEach(button => button.addEventListener('click', () => {
      const kind = button.dataset.add as 'normal' | 'challenge';
      if (input[kind].length >= MAX_CANDIDATES) return;
      if (kind === 'normal') input.normal.push({ name: '', enabled: true, rank: 'S', bonus: 0 });
      else input.challenge.push({ name: '', enabled: true, rank: 'SS', bonus: 0 });
      render(); refresh(true);
      host.querySelectorAll<HTMLElement>(`[data-candidates="${kind}"] [data-candidate-field="name"]`).item(input[kind].length - 1)?.focus();
    }));
    host.querySelectorAll<HTMLElement>('[data-remove]').forEach(button => button.addEventListener('click', () => {
      const kind = button.dataset.remove as 'normal' | 'challenge', index = Number(button.dataset.index);
      input[kind].splice(index, 1); render(); refresh(true);
      host.querySelector<HTMLElement>(`[data-add="${kind}"]`)?.focus();
    }));
    host.querySelector('[data-reset-bases]')!.addEventListener('click', () => {
      input.bases = defaultRankBases(); render(); host.querySelector<HTMLDetailsElement>('.event-settings')!.open = true; refresh(true);
    });
    host.querySelector('[data-export-event]')!.addEventListener('click', () => {
      try { download(exportEventInput(input), 'atsudori-event-planner.json'); actionMessage = '入力値をExportしました。'; }
      catch (error) { actionMessage = message(error); }
      refresh(false);
    });
    host.querySelector('[data-export-damaged]')?.addEventListener('click', () => download(damaged!, 'atsudori-event-planner-original.json'));
    host.querySelector('[data-recover-event]')?.addEventListener('click', () => {
      if (!window.confirm('保護中の元JSONを初期値で置き換えます。必要なら先に元JSONをExportしてください。')) return;
      input = defaultEventInput(); allowWrites = true; render(); refresh(true);
    });
    host.querySelector<HTMLInputElement>('[data-import-event]')!.addEventListener('change', async event => {
      const file = (event.target as HTMLInputElement).files?.[0], token = ++readId;
      pendingImport = undefined; importMessage = ''; updateImportPreview();
      if (!file) return;
      try {
        if (file.size > EVENT_JSON_LIMIT) throw new Error('JSONは64KiB以内にしてください');
        const next = importEventInput(await file.text());
        if (token !== readId || !host.isConnected) return;
        pendingImport = next;
      } catch (error) {
        if (token !== readId || !host.isConnected) return;
        importMessage = message(error);
      }
      updateImportPreview();
    });
    updateImportPreview(); refresh(false);
  }
  return { mount(element: HTMLElement): void { host = element; render(); }, saveState };
}
