import type { StoragePort } from '../storage/local';
import { createStarBudgetStore } from '../storage/star-budget';
import { PASS_GRADES } from '../domain/star-budget/model';
import type { BudgetValue, StarBudgetInput } from '../domain/star-budget/model';
import { calculateStarBudget } from '../domain/star-budget/calculate';
import type { BudgetAmount } from '../domain/star-budget/calculate';
import { emptyStarBudget, exportStarBudget, importStarBudget, STAR_BUDGET_JSON_LIMIT, unknownBudgetValue, validateStarBudget } from '../domain/star-budget/validate';

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (n: number): string => n !== 0 && Math.abs(n) < 0.01 ? n.toExponential(2) : n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
const amount = (a: BudgetAmount): string => a.value === null ? `未確認（既知分 ${num(a.knownSubtotal)}）` : num(a.value);
const grades = { none: 'なし', lite: 'Lite', standard: 'Standard', premium: 'Premium' };
const errorText = (error: unknown): string => error instanceof Error ? error.message : '操作を完了できませんでした';
type Control = HTMLInputElement | HTMLSelectElement;

export function createStarBudgetView(storage: StoragePort | undefined, download: (text: string, filename: string) => void, changed: () => void) {
  const store = createStarBudgetStore(storage);
  let message = '', invalid = '', importId = 0;
  const rawDraft = new Map<string, string | boolean>();
  // Browsers expose incomplete number tokens as an empty value. Keep their invalid
  // state across remounts so they cannot be mistaken for intentionally unknown input.
  const incompleteNumbers = new Set<string>();
  const field = (path: string, label: string, value: unknown, numeric = false, min = 0, step = '1'): string =>
    `<label class="field">${esc(label)}<input name="${path}" data-path="${path}" type="${numeric ? 'number' : 'text'}" ${numeric ? `min="${min}" step="${step}" placeholder="未確認"` : 'maxlength="300"'} value="${esc(value ?? '')}"></label>`;
  const metric = (path: string, label: string, m: BudgetValue, unit: string, min = 0, step = '1'): string =>
    `<fieldset class="budget-metric"><legend>${esc(label)}</legend>${field(path + '.value', unit, m.value, true, min, step)}<label class="field">根拠の区分<select name="${path}.status" data-path="${path}.status">${[['unconfirmed', '未確認'], ['assumed', '仮定'], ['confirmed', '確認済み（登録者の申告）']].map(([v, label]) => `<option value="${v}" ${m.status === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field(path + '.basis', '根拠・適用範囲', m.basis)}</fieldset>`;
  const checkbox = (path: string, label: string, checked: boolean): string => `<label class="budget-check"><input type="checkbox" name="${path}" data-path="${path}" ${checked ? 'checked' : ''}>${esc(label)}</label>`;

  function mount(host: HTMLElement): void {
    const input = store.current(), d = input.definition, s = input.scenario;
    host.innerHTML = `<section class="panel budget-toolbar"><h2>スター予算のデータ</h2><p>実ゲームの報酬・価格は同梱していません。条件・定義JSONをImportするか、下の「定義・根拠」を入力してください。数値の入力時は「手入力の仮定」として扱います。</p><p data-budget-message role="status"></p>${store.protected() ? `<p role="alert">既存の条件を保護しています。元JSONをExportし、対応するJSONのImportまたは初期化で復旧してください。</p>${store.original() !== undefined ? '<button type="button" class="secondary" data-budget-original>元JSONをExport</button>' : ''}` : ''}<div class="budget-actions"><button type="button" class="primary" data-budget-import>条件・定義JSONをImport</button><input type="file" accept=".json,application/json" hidden data-budget-file><button type="button" class="secondary" data-budget-export>条件・定義JSONをExport</button><button type="button" class="secondary" data-budget-retry>保存を再試行</button><button type="button" class="secondary danger" data-budget-reset>スター予算を初期化</button></div></section>
      <form id="star-budget-form"><fieldset class="budget-form-body" ${store.protected() ? 'disabled' : ''}><section class="panel"><h2>試算条件・毎週の全交換</h2><div class="form-grid">${field('scenario.rank', 'T.G.Wランク', s.rank, true, 1)}${field('scenario.storyEventPercent', 'ストーリー付きイベント割合（%）', s.storyEventPercent, true)}</div><p class="muted">ストーリーなしは0、毎回ありは100。対象回の全話を回収する想定です。入力変更のたび再計算・自動保存します。</p><div class="budget-checks">${checkbox('scenario.eventPremium', 'イベントミッションPremiumを購入', s.eventPremium)}${checkbox('scenario.seasonPremium', 'シーズンミッションPremiumを購入', s.seasonPremium)}${checkbox('scenario.includeArena', 'プラチナ1の反復スターを含む（存在確認が必要）', s.includeArena)}</div>
      <p>選んだ商品は、解放済みの価格段階を週上限まで全交換します。SRピースはバンドごとに切り替えます。</p><div class="budget-scroll" tabindex="0" aria-label="商品別の全交換条件"><table class="budget-products"><thead><tr><th scope="col">全交換する商品</th><th scope="col">解放状態</th><th scope="col">週のスター費用</th></tr></thead><tbody>${d.products.map(p => `<tr data-budget-product="${p.id}"><th scope="row"><label><input type="checkbox" name="selected-${p.id}" ${s.selectedProducts.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label></th><td data-product-status></td><td data-product-cost></td></tr>`).join('')}</tbody></table></div></section>
      <div data-budget-results></div>
      <section class="panel budget-definition"><h2>定義・根拠</h2><p>空欄は未確認、0は報酬・費用が0という明示値です。「確認済み」は登録者の根拠に基づく区分です。仮定の数値をゲームの確定値として扱いません。</p>${field('definition.revision', '定義の版', d.revision)}
      <details data-section="daily"><summary>日課・ライブスタンプ</summary>${metric('definition.loginDaily', '通常ログイン（ライブスタンプを除く）', d.loginDaily, 'スター/日')}${metric('definition.missionDaily', 'デイリーミッション', d.missionDaily, 'スター/日')}${metric('definition.liveStampWeekly', 'ライブスタンプ', d.liveStampWeekly, 'スター/週')}${field('definition.liveStampSelection', 'ライブスタンプの報酬選択・前提', d.liveStampSelection)}</details>
      <details data-section="event"><summary>標準イベント・ストーリー</summary>${metric('definition.event.intervalDays', '想定開催間隔', d.event.intervalDays, '日/イベント', 0.01, '0.01')}${metric('definition.event.points', '累計pt報酬', d.event.points, 'スター/イベント')}${metric('definition.event.missionFree', 'イベントミッション無料', d.event.missionFree, 'スター/イベント')}${metric('definition.event.missionPremium', 'イベントミッションPremium追加（無料分を除く）', d.event.missionPremium, '追加スター/イベント')}${metric('definition.event.storyPerEpisode', 'ストーリー1話', d.event.storyPerEpisode, 'スター/話')}${metric('definition.event.storyEpisodes', 'ストーリー全回収話数', d.event.storyEpisodes, '話/イベント')}</details>
      <details data-section="season"><summary>シーズンミッション</summary>${metric('definition.season.intervalDays', 'シーズン換算日数', d.season.intervalDays, '日/シーズン', 0.01, '0.01')}${metric('definition.season.free', 'シーズン無料', d.season.free, 'スター/シーズン')}${metric('definition.season.premium', 'シーズンPremium追加（無料分を除く）', d.season.premium, '追加スター/シーズン')}</details>
      <details data-section="arena"><summary>撃奏アリーナ・プラチナ1</summary><p>繰り返し獲得できるスターのみ登録してください。初回到達報酬・ガチャチケットは含めません。反復報酬が存在しないと確認した場合は0を登録できます。</p>${metric('definition.arena.intervalDays', '反復周期', d.arena.intervalDays, '日/周期', 0.01, '0.01')}${metric('definition.arena.recurringStars', '反復スター報酬', d.arena.recurringStars, 'スター/周期')}</details>
      <details data-section="passes"><summary>アワーノーツパス・スターの利用条件</summary><p>継続更新・毎日回収の想定です。無料ガチャ権利・チケット・素材をスターへ換算しません。</p><label class="field">カタログ支払時の有償／無償スターの合算<select name="definition.starCompatibility" data-path="definition.starCompatibility">${[['unconfirmed', '未確認（収支保留）'], ['assumed-usable', '合算できると仮定'], ['confirmed-usable', '合算できると確認'], ['restricted', '利用制約あり（収支保留）']].map(([v, label]) => `<option value="${v}" ${d.starCompatibility === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('definition.starCompatibilityBasis', '合算可否の根拠・仮定', d.starCompatibilityBasis)}${PASS_GRADES.map(grade => `<details data-section="pass-${grade}"><summary>${grades[grade]}</summary>${metric(`definition.passes.${grade}.periodDays`, '継続更新日数', d.passes[grade].periodDays, '日/契約', 0.01, '0.01')}${metric(`definition.passes.${grade}.purchaseStars`, '購入時スター', d.passes[grade].purchaseStars, 'スター/契約')}${metric(`definition.passes.${grade}.dailyStars`, '毎日スター', d.passes[grade].dailyStars, 'スター/日')}${metric(`definition.passes.${grade}.priceYen`, '1契約の円価格', d.passes[grade].priceYen, '円/契約')}</details>`).join('')}</details>
      <details data-section="products"><summary>商品価格・週上限・解放条件</summary><p>価格が途中で変わる場合は価格段階を追加します。週上限はその段階の交換回数です（複数個セットでも1交換）。すべての段階を全交換します。商品名には対象バンド・セット内容を明記してください。</p>${d.products.map((p, i) => `<details data-section="product-${p.id}"><summary>${esc(p.name)}</summary>${field(`definition.products.${i}.name`, '商品名・対象バンド', p.name)}${metric(`definition.products.${i}.unlockRank`, '解放T.G.Wランク', p.unlockRank, 'ランク', 1)}${p.tiers.map((t, j) => `<div class="budget-tier"><h3>価格段階 ${j + 1}</h3>${metric(`definition.products.${i}.tiers.${j}.starCost`, '価格', t.starCost, 'スター/交換')}${metric(`definition.products.${i}.tiers.${j}.weeklyLimit`, '週上限', t.weeklyLimit, '交換/週')}<button type="button" class="secondary" data-remove-tier="${i}:${j}" ${p.tiers.length === 1 ? 'disabled' : ''}>この価格段階を削除</button></div>`).join('')}<button type="button" class="secondary" data-add-tier="${i}" ${p.tiers.length >= 20 ? 'disabled' : ''}>価格段階を追加</button></details>`).join('')}</details></section></fieldset></form>`;
    const form = host.querySelector<HTMLFormElement>('#star-budget-form')!;
    for (const el of form.querySelectorAll<Control>('input,select')) {
      const raw = rawDraft.get(el.name);
      if (raw === undefined) continue;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = raw === true;
      else el.value = String(raw);
    }
    function read(): StarBudgetInput {
      const next = store.current();
      for (const el of form.querySelectorAll<Control>('[data-path]')) {
        const parts = el.dataset.path!.split('.'), key = parts.pop()!;
        let parent: unknown = next;
        for (const part of parts) parent = (parent as Record<string, unknown>)[part];
        let value: unknown = el.value;
        if (el instanceof HTMLInputElement) {
          if (el.validity.badInput || incompleteNumbers.has(el.name)) {
            const label = el.closest('.budget-metric')?.querySelector('legend')?.textContent ?? el.closest('label')?.textContent?.trim() ?? '数値';
            throw new Error(label + 'の入力を確認してください。画面切替後は数値を入れ直してください。');
          }
          if (el.type === 'number') value = el.value.trim() ? Number(el.value) : null;
          if (el.type === 'checkbox') value = el.checked;
        }
        (parent as Record<string, unknown>)[key] = value;
      }
      next.scenario.selectedProducts = next.definition.products.filter(p => form.querySelector<HTMLInputElement>(`[name="selected-${p.id}"]`)!.checked).map(p => p.id);
      return validateStarBudget(next);
    }
    function updateMessages(): void {
      const status = host.querySelector<HTMLElement>('[data-budget-message]')!;
      status.textContent = invalid || message || store.message();
      status.classList.toggle('error-text', Boolean(invalid || store.unsaved()));
      changed();
    }
    function display(): void {
      const target = host.querySelector<HTMLElement>('[data-budget-results]')!;
      const expanded = new Map([...target.querySelectorAll<HTMLDetailsElement>('details')].map(el => [el.dataset.section, el.open]));
      if (store.protected()) { target.innerHTML = ''; updateMessages(); return; }
      try {
        const r = calculateStarBudget(read());
        invalid = '';
        const rows: [string, (c: typeof r.comparisons[number]) => string][] = [
          ['日課等の共通供給', c => amount(c.commonSupply)], ['パス追加スター', c => amount(c.passSupply)],
          ['週平均総供給', c => amount(c.totalSupply)], ['週の全交換費用', c => amount(c.weeklyCost)],
          ['差引残高（ガチャ・貯蓄へ）', c => c.balance.value === null ? '算出不可' : (c.balance.value > 0 ? '+' : '') + num(c.balance.value)],
          ['継続全交換の収支', c => ({ unknown: '未確認のため保留', shortfall: 'スター不足', surplus: '平均余剰あり', balanced: '差引0' })[c.status]],
          ['アワーノーツパス参考円/30日', c => amount(c.yenPer30Days)],
        ];
        const issues = [...new Set(r.comparisons.flatMap(c => [...c.totalSupply.reasons, ...c.weeklyCost.reasons, ...c.balance.reasons, ...c.yenPer30Days.reasons]))];
        target.innerHTML = `<section class="panel"><h2>アワーノーツパス4種類の比較</h2><p>単位はスター/週（円価格の行を除く）。仮定を含む入力に基づく平均で、獲得タイミングや資金繰りを保証しません。未確認が残る場合は確定収支を表示しません。</p><div class="budget-scroll" tabindex="0" aria-label="パス4種類の収支比較"><table class="budget-comparison"><thead><tr><th scope="col">項目</th>${r.comparisons.map(c => `<th scope="col">${grades[c.grade]}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, value], i) => `<tr><th scope="row">${label}</th>${r.comparisons.map(c => `<td ${i === 4 ? `data-budget-balance="${c.grade}" class="budget-${c.status}"` : ''}>${esc(value(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${issues.length ? `<details open data-section="issues"><summary>未確認事項</summary><ul>${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></details>` : ''}<details data-section="supply"><summary>供給の内訳・根拠と前提</summary><ul>${r.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul><div class="budget-scroll" tabindex="0" aria-label="供給の内訳"><table><thead><tr><th scope="col">供給源</th><th scope="col">スター/週</th><th scope="col">根拠・換算条件</th></tr></thead><tbody>${r.supply.map(row => `<tr data-budget-source="${row.id}"><th scope="row">${esc(row.name)}</th><td>${esc(amount(row))}</td><td>${row.evidence.map(e => `<div>${esc(e)}</div>`).join('')}</td></tr>`).join('')}${r.comparisons.filter(c => c.grade !== 'none').map(c => `<tr><th scope="row">${grades[c.grade]}</th><td>${esc(amount(c.passSupply))}</td><td>${c.evidence.map(e => `<div>${esc(e)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div></details><details data-section="cost"><summary>選択商品合計・価格の根拠</summary><p>週の全交換費用: ${esc(amount(r.weeklyCost))} スター</p><ul>${r.products.filter(p => p.selected).map(p => `<li>${esc(p.name)}: ${esc(amount(p))} スター/週<ul>${p.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul></li>`).join('')}</ul></details></section>`;
        for (const row of r.products) {
          const el = form.querySelector<HTMLElement>(`[data-budget-product="${row.id}"]`)!;
          el.querySelector('label')!.lastChild!.textContent = row.name;
          el.querySelector('[data-product-status]')!.textContent = { off: '交換OFF', locked: '未解放（費用に含めない）', unlocked: '解放済み', unknown: '解放条件が未確認' }[row.availability];
          el.querySelector('[data-product-cost]')!.textContent = amount(row);
        }
        target.querySelectorAll<HTMLDetailsElement>('details').forEach(el => { if (expanded.has(el.dataset.section)) el.open = expanded.get(el.dataset.section)!; });
      } catch (error) {
        invalid = '入力は未保存です。' + errorText(error);
        target.innerHTML = '<section class="panel"><p role="alert">入力の修正後に収支を再計算します。</p></section>';
        form.querySelectorAll('[data-product-status],[data-product-cost]').forEach(el => { el.textContent = '入力を確認'; });
      }
      updateMessages();
    }
    function capture(): void {
      rawDraft.clear();
      for (const el of form.querySelectorAll<Control>('input,select')) rawDraft.set(el.name, el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value);
    }
    function save(): void {
      importId++; message = '';
      capture();
      try { const next = read(); calculateStarBudget(next); store.update(next); rawDraft.clear(); invalid = ''; }
      catch (error) { invalid = '入力は未保存です。' + errorText(error); }
      display();
    }
    form.addEventListener('submit', e => { e.preventDefault(); save(); });
    form.addEventListener('input', event => {
      const el = event.target as Control, name = el.name;
      if (el instanceof HTMLInputElement && el.type === 'number') {
        if (el.validity.badInput) incompleteNumbers.add(name); else incompleteNumbers.delete(name);
      }
      if (name.endsWith('.value')) {
        const base = name.slice(0, -6), status = form.elements.namedItem(base + '.status') as HTMLSelectElement;
        const basis = form.elements.namedItem(base + '.basis') as HTMLInputElement;
        if (!el.value) status.value = 'unconfirmed';
        else { status.value = 'assumed'; if (!basis.value.trim()) basis.value = '手入力の仮定'; }
      }
      if (name.endsWith('.status') && el.value === 'unconfirmed') {
        const valueName = name.replace(/\.status$/, '.value');
        (form.elements.namedItem(valueName) as HTMLInputElement).value = ''; incompleteNumbers.delete(valueName);
      }
      save();
    });
    function action(fn: () => void): void { try { fn(); } catch (error) { message = errorText(error); } updateMessages(); }
    host.querySelector('[data-budget-export]')!.addEventListener('click', () => action(() => download(exportStarBudget(read()), 'star-budget.json')));
    host.querySelector('[data-budget-original]')?.addEventListener('click', () => action(() => download(store.original()!, 'star-budget-original.json')));
    host.querySelector('[data-budget-retry]')!.addEventListener('click', save);
    host.querySelector('[data-budget-reset]')!.addEventListener('click', () => {
      if (!window.confirm('スター予算の条件・定義を空にします。必要なJSONをExport済みですか？')) return;
      importId++;
      action(() => { store.update(emptyStarBudget(), { recover: true, atomic: true }); rawDraft.clear(); incompleteNumbers.clear(); invalid = ''; message = 'スター予算を初期化しました'; mount(host); });
    });
    const file = host.querySelector<HTMLInputElement>('[data-budget-file]')!;
    host.querySelector('[data-budget-import]')!.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const selected = file.files?.[0]; file.value = ''; if (!selected) return;
      const id = ++importId;
      try {
        if (selected.size > STAR_BUDGET_JSON_LIMIT) throw new Error('スター予算JSONの上限は256KiBです');
        const raw = await selected.text(); if (id !== importId) return;
        const next = importStarBudget(raw); calculateStarBudget(next);
        if (store.protected() && !window.confirm('保護中のスター予算をImportしたJSONで置き換えます。元JSONをExport済みですか？')) return;
        store.update(next, { recover: true, atomic: true }); rawDraft.clear(); incompleteNumbers.clear(); invalid = ''; message = 'スター予算をImport・保存しました';
        if (host.isConnected) mount(host);
      } catch (error) { if (id === importId) { message = errorText(error); if (host.isConnected) updateMessages(); } }
    });
    function tiers(index: number, remove?: number): void {
      action(() => {
        const next = read(), product = next.definition.products[index]!;
        if (remove === undefined) product.tiers.push({ starCost: unknownBudgetValue(), weeklyLimit: unknownBudgetValue() });
        else product.tiers.splice(remove, 1);
        calculateStarBudget(next); store.update(next); importId++; rawDraft.clear(); invalid = '';
        const expanded = [...host.querySelectorAll<HTMLDetailsElement>('details[open]')].map(el => el.dataset.section);
        const scroll = window.scrollY;
        mount(host);
        host.querySelectorAll<HTMLDetailsElement>('details').forEach(el => { if (expanded.includes(el.dataset.section)) el.open = true; });
        window.scrollTo(window.scrollX, scroll);
      });
    }
    host.querySelectorAll<HTMLElement>('[data-add-tier]').forEach(el => el.addEventListener('click', () => tiers(Number(el.dataset.addTier))));
    host.querySelectorAll<HTMLElement>('[data-remove-tier]').forEach(el => el.addEventListener('click', () => { const [i, j] = el.dataset.removeTier!.split(':').map(Number); tiers(i!, j); }));
    display();
  }
  return { mount, saveState: () => ({ label: invalid ? 'スター予算 未保存の入力あり' : store.protected() ? 'スター予算 保存データを保護中' : store.unsaved() ? 'スター予算 保存未完了' : 'スター予算 自動保存', unsaved: Boolean(invalid) || store.unsaved() || store.protected() }) };
}
