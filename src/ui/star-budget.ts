import { uiNumberField, uiCheckbox } from './form-patterns';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { defaultStarBudgetScenario } from '../domain/star-budget/model';
import type { StarBudgetInput } from '../domain/star-budget/model';
import { calculateStarBudget } from '../domain/star-budget/calculate';
import type { BudgetAmount } from '../domain/star-budget/calculate';
import { validateStarBudget } from '../domain/star-budget/validate';

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (n: number): string => n !== 0 && Math.abs(n) < 0.01 ? n.toExponential(2) : n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
const amount = (a: BudgetAmount): string => a.value === null ? `未確認（既知分 ${num(a.knownSubtotal)}）` : num(a.value);
const grades = { none: 'なし', lite: 'Lite', standard: 'Standard', premium: 'Premium' };
const errorText = (error: unknown): string => error instanceof Error ? error.message : '操作を完了できませんでした';


export function createStarBudgetView(
  current: () => { master: Masterdata; collection: Collection; protected: boolean; unsaved: boolean; message: string },
  persist: (next: Collection) => boolean,
  changed: () => void,
) {
  let invalid = '';
  function mount(host: HTMLElement): void {
    invalid = '';
    const state = current(), d = state.master.starBudgetDefinition;
    if (!d) {
      host.innerHTML = '<section class="panel"><p>マスタにスター予算定義がないため計算できません。JSON Import / Exportで対応するマスタを登録してください。</p></section>';
      return;
    }
    const s = { ...(state.collection.starBudgetScenario ?? defaultStarBudgetScenario()), rank: state.collection.tgwRank ?? null };
    host.innerHTML = `<form id="star-budget-form"><div data-budget-results></div>
      <section class="panel budget-conditions" aria-labelledby="budget-conditions-heading">
        <div class="panel-heading"><h2 id="budget-conditions-heading" tabindex="-1">試算条件</h2><button type="button" class="secondary small" data-budget-jump="budget-comparison-heading" ${state.protected ? 'disabled' : ''}>比較結果へ</button></div>
        <p class="ui-help">変更は所持データへ自動保存</p><p id="budget-message" class="ui-feedback" data-budget-message role="status"></p>
        <fieldset class="budget-form-body" ${state.protected ? 'disabled' : ''}><legend class="sr-only">スター予算の入力</legend>
          <fieldset class="ui-group"><legend>ランク・イベント</legend><div class="ui-fields">
            ${uiNumberField({id:'budget-rank', name:'scenario.rank', label:'T.G.Wランク', value:s.rank, min:1, max:Number.MAX_SAFE_INTEGER, help:'キャラランクと共有。空欄は未確認。'})}
            ${uiNumberField({id:'budget-story', name:'scenario.storyEventPercent', label:'ストーリー付きイベント割合（%）', value:s.storyEventPercent, min:0, max:100, help:'0%=なし / 100%=毎回あり（全話回収）'})}
          </div></fieldset>
          <fieldset class="ui-group"><legend>供給に含める報酬</legend><div class="budget-checks">
            ${uiCheckbox({id:'budget-event',name:'scenario.eventPremium',label:'イベントミッションPremiumを購入',checked:s.eventPremium})}
            ${uiCheckbox({id:'budget-season',name:'scenario.seasonPremium',label:'シーズンミッションPremiumを購入',checked:s.seasonPremium})}
            ${uiCheckbox({id:'budget-arena',name:'scenario.includeArena',label:'プラチナ1の反復スターを含む',checked:s.includeArena,help:'反復報酬の存在・周期は定義の根拠を確認してください。'})}
          </div></fieldset>
          <fieldset class="ui-group"><legend>毎週の全交換</legend><p class="ui-help" id="budget-products-help">選択した商品の解放済み価格段階を週上限まで計上。SRピースはバンドごとに選択します。</p>
            <p class="ui-scroll-hint">横にスクロールして解放状態・費用を確認できます。</p>
            <div class="budget-scroll" tabindex="0" role="region" aria-label="商品別の全交換条件" aria-describedby="budget-products-help"><table class="budget-products"><caption class="sr-only">商品ごとの全交換条件とスター/週</caption><thead><tr><th scope="col">全交換する商品</th><th scope="col">解放状態</th><th scope="col">スター/週</th></tr></thead><tbody>${d.products.map(p => `<tr data-budget-product="${p.id}"><th scope="row">${uiCheckbox({id:'budget-product-'+p.id,name:'selected-'+p.id,label:p.name,checked:s.selectedProducts.includes(p.id)})}</th><td data-product-status></td><td data-product-cost></td></tr>`).join('')}</tbody></table></div>
          </fieldset>
          <button type="button" class="secondary" data-budget-jump="budget-comparison-heading" ${state.protected ? 'disabled' : ''}>比較結果へ戻る</button>
        </fieldset>
        <details class="ui-details"><summary>価格・報酬の設定元</summary><p class="ui-help">価格・報酬・根拠は登録マスタの定義を使用します。変更する場合はJSON Import / Exportでマスタを更新してください。</p></details>
      </section></form>`;
    host.querySelectorAll<HTMLButtonElement>('[data-budget-jump]').forEach(button => button.addEventListener('click', () => {
      const heading = host.querySelector<HTMLElement>(`#${button.dataset.budgetJump}`);
      heading?.focus({preventScroll:true}); heading?.scrollIntoView({block:'start'});
    }));
    const form = host.querySelector<HTMLFormElement>('#star-budget-form')!;
    const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    function read(): StarBudgetInput {
      const number = (name: string): number | null => {
        const el = input(name);
        if (!el.validity.valid) throw new Error('数値の入力を確認してください');
        return el.value.trim() ? Number(el.value) : null;
      };
      return validateStarBudget({ definition: current().master.starBudgetDefinition,
        scenario: { rank: number('scenario.rank'), storyEventPercent: number('scenario.storyEventPercent'),
          eventPremium: input('scenario.eventPremium').checked, seasonPremium: input('scenario.seasonPremium').checked,
          includeArena: input('scenario.includeArena').checked,
          selectedProducts: d!.products.filter(p => input('selected-' + p.id).checked).map(p => p.id) } });
    }
    function updateMessages(): void {
      const state = current(), status = host.querySelector<HTMLElement>('[data-budget-message]')!;
      status.textContent = invalid || (state.protected ? '保存データを保護しています。JSON Import / Exportで復旧してください。' : state.message);
      status.classList.toggle('error-text', Boolean(invalid || state.unsaved || state.protected));
      const resultState = host.querySelector<HTMLElement>('[data-budget-result-state]');
      if (resultState) { resultState.hidden = !invalid && !state.unsaved; resultState.textContent = '入力は未保存です。以下は変更前の条件による結果です。'; }
      form.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(el => {
        const bad = !el.validity.valid;
        el.setAttribute('aria-invalid', String(bad));
        const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== 'budget-message');
        if (bad) ids.push('budget-message');
        el.setAttribute('aria-describedby', ids.join(' '));
      });
      changed();
    }
    function display(): void {
      const target = host.querySelector<HTMLElement>('[data-budget-results]')!;
      const expanded = new Map([...target.querySelectorAll<HTMLDetailsElement>('details')].map(el => [el.dataset.section, el.open]));
      if (current().protected) { target.innerHTML = ''; updateMessages(); return; }
      try {
        const state = current();
        const r = calculateStarBudget({ definition: state.master.starBudgetDefinition!,
          scenario: { ...(state.collection.starBudgetScenario ?? defaultStarBudgetScenario()), rank: state.collection.tgwRank ?? null } });
        const rows: [string, string, (c: typeof r.comparisons[number]) => string][] = [
          ['total-supply', '週平均総供給', c => amount(c.totalSupply)],
          ['weekly-cost', '週の全交換費用', c => amount(c.weeklyCost)],
          ['balance', '差引残高（ガチャ・貯蓄へ）', c => c.balance.value === null ? '算出不可' : (c.balance.value > 0 ? '+' : '') + num(c.balance.value)],
          ['status', '継続全交換の収支', c => ({ unknown: '未確認のため保留', shortfall: 'スター不足', surplus: '平均余剰あり', balanced: '差引0' })[c.status]],
          ['common-supply', '日課等の共通供給', c => amount(c.commonSupply)], ['pass-supply', 'パス追加スター', c => amount(c.passSupply)],
          ['yen', 'アワーノーツパス参考円/30日', c => amount(c.yenPer30Days)],
        ];
        const issues = [...new Set(r.comparisons.flatMap(c => [...c.totalSupply.reasons, ...c.weeklyCost.reasons, ...c.balance.reasons, ...c.yenPer30Days.reasons]))];
        target.innerHTML = `<section class="panel budget-results" aria-labelledby="budget-comparison-heading"><div class="panel-heading"><h2 id="budget-comparison-heading" tabindex="-1">アワーノーツパス4種類の比較</h2><button type="button" class="secondary small" data-budget-conditions>試算条件へ</button></div>
          <p class="ui-help" data-budget-result-context>T.G.Wランク: ${state.collection.tgwRank === undefined ? '未確認' : num(state.collection.tgwRank)} · 選択: ${r.products.filter(p => p.selected).length}商品</p>
          <p class="ui-feedback budget-stale" data-budget-result-state hidden></p>
          <p class="ui-scroll-hint" id="budget-comparison-help">左右にスクロールして4種類を比較できます。</p>
          <div class="budget-scroll budget-comparison-scroll" tabindex="0" role="region" aria-label="パス4種類の収支比較" aria-describedby="budget-comparison-help"><table class="budget-comparison"><caption>スター/週（円価格の行を除く）</caption><thead><tr><th scope="col">項目</th>${r.comparisons.map(c => `<th scope="col">${grades[c.grade]}</th>`).join('')}</tr></thead><tbody>${rows.map(([key, label, value]) => `<tr data-budget-metric="${key}" class="${['total-supply','weekly-cost','balance'].includes(key) ? 'budget-primary' : ''}"><th scope="row">${label}</th>${r.comparisons.map(c => `<td ${key === 'balance' ? `data-budget-balance="${c.grade}" class="budget-${c.status}"` : ''}>${esc(value(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p class="ui-help budget-interpretation">仮定を含む週平均の概算です。獲得タイミングや資金繰りを保証しません。</p>
          ${r.comparisons.some(c => c.status === 'unknown') ? '<p class="ui-feedback budget-pending">未確認が残る収支は保留です。既知分の小計と未確認理由を確認してください。</p>' : ''}
          ${issues.length ? `<details open class="ui-details" data-section="issues"><summary>未確認事項</summary><ul>${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></details>` : ''}<details class="ui-details" data-section="supply"><summary>供給の内訳・根拠と前提</summary><ul>${r.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul><div class="budget-scroll" tabindex="0" aria-label="供給の内訳"><table><thead><tr><th scope="col">供給源</th><th scope="col">スター/週</th><th scope="col">根拠・換算条件</th></tr></thead><tbody>${r.supply.map(row => `<tr data-budget-source="${row.id}"><th scope="row">${esc(row.name)}</th><td>${esc(amount(row))}</td><td>${row.evidence.map(e => `<div>${esc(e)}</div>`).join('')}</td></tr>`).join('')}${r.comparisons.filter(c => c.grade !== 'none').map(c => `<tr><th scope="row">${grades[c.grade]}</th><td>${esc(amount(c.passSupply))}</td><td>${c.evidence.map(e => `<div>${esc(e)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div></details><details class="ui-details" data-section="cost"><summary>選択商品合計・価格の根拠</summary><p>週の全交換費用: ${esc(amount(r.weeklyCost))} スター</p><ul>${r.products.filter(p => p.selected).map(p => `<li>${esc(p.name)}: ${esc(amount(p))} スター/週<ul>${p.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul></li>`).join('')}</ul></details></section>`;
        target.querySelector('[data-budget-conditions]')!.addEventListener('click', () => {
          const heading = host.querySelector<HTMLElement>('#budget-conditions-heading')!;
          heading.focus({preventScroll:true}); heading.scrollIntoView({block:'start'});
        });
        for (const row of r.products) {
          const el = form.querySelector<HTMLElement>(`[data-budget-product="${row.id}"]`)!;
          el.querySelector('label')!.lastChild!.textContent = row.name;
          el.querySelector('[data-product-status]')!.textContent = { off: '交換OFF', locked: '未解放（費用に含めない）', unlocked: '解放済み', unknown: '解放条件が未確認' }[row.availability];
          el.querySelector('[data-product-cost]')!.textContent = amount(row);
        }
        target.querySelectorAll<HTMLDetailsElement>('details').forEach(el => { if (expanded.has(el.dataset.section)) el.open = expanded.get(el.dataset.section)!; });
      } catch (error) {
        invalid = errorText(error);
        target.innerHTML = '<section class="panel"><p role="alert">入力の修正後に収支を再計算します。</p></section>';
      }
      updateMessages();
    }
    function save(): void {
      if (current().protected) return;
      try {
        const next = read();
        calculateStarBudget(next);
        const { rank, ...starBudgetScenario } = next.scenario;
        const collection = { ...current().collection, starBudgetScenario };
        if (rank === null) delete collection.tgwRank; else collection.tgwRank = rank;
        if (!persist(collection)) throw new Error('ブラウザ保存ができませんでした。条件は未保存です。');
        invalid = '';
      } catch (error) { invalid = '入力は未保存です。結果は変更前の条件です。' + errorText(error); }
      display();
    }
    form.addEventListener('submit', e => { e.preventDefault(); save(); });
    form.addEventListener('input', save);
    display();
  }
  return { mount, saveState: () => {
    const state = current();
    return { label: invalid ? 'スター予算 未保存の入力あり' : state.protected ? 'スター予算 保存データを保護中' : state.unsaved ? 'スター予算 保存未完了' : 'スター予算 自動保存',
      unsaved: Boolean(invalid) || state.unsaved || state.protected };
  } };
}
