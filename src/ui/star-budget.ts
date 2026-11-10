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
  const field = (path: string, label: string, value: number | null, min = 0): string =>
    `<label class="field">${esc(label)}<input name="${path}" type="number" min="${min}" step="1" placeholder="未確認" value="${esc(value ?? '')}"></label>`;
  const checkbox = (path: string, label: string, checked: boolean): string =>
    `<label class="budget-check"><input type="checkbox" name="${path}" ${checked ? 'checked' : ''}>${esc(label)}</label>`;
  function mount(host: HTMLElement): void {
    invalid = '';
    const state = current(), d = state.master.starBudgetDefinition;
    if (!d) {
      host.innerHTML = '<section class="panel"><p>マスタにスター予算定義がないため計算できません。JSON Import / Exportで対応するマスタを登録してください。</p></section>';
      return;
    }
    const s = { ...(state.collection.starBudgetScenario ?? defaultStarBudgetScenario()), rank: state.collection.tgwRank ?? null };
    host.innerHTML = `<section class="panel"><p>価格・報酬・根拠は登録マスタの定義を使用します。変更する場合はJSON Import / Exportでマスタを更新してください。</p><p data-budget-message role="status"></p></section>
      <form id="star-budget-form"><fieldset class="budget-form-body" ${state.protected ? 'disabled' : ''}><section class="panel"><h2>試算条件・毎週の全交換</h2><div class="form-grid">${field('scenario.rank', 'T.G.Wランク', s.rank, 1)}${field('scenario.storyEventPercent', 'ストーリー付きイベント割合（%）', s.storyEventPercent)}</div><p class="muted">ストーリーなしは0、毎回ありは100。対象回の全話を回収する想定です。条件は所持データへ自動保存します。</p><div class="budget-checks">${checkbox('scenario.eventPremium', 'イベントミッションPremiumを購入', s.eventPremium)}${checkbox('scenario.seasonPremium', 'シーズンミッションPremiumを購入', s.seasonPremium)}${checkbox('scenario.includeArena', 'プラチナ1の反復スターを含む（存在確認が必要）', s.includeArena)}</div>
      <p>選んだ商品は、解放済みの価格段階を週上限まで全交換します。SRピースはバンドごとに切り替えます。</p><div class="budget-scroll" tabindex="0" aria-label="商品別の全交換条件"><table class="budget-products"><thead><tr><th scope="col">全交換する商品</th><th scope="col">解放状態</th><th scope="col">週のスター費用</th></tr></thead><tbody>${d.products.map(p => `<tr data-budget-product="${p.id}"><th scope="row"><label><input type="checkbox" name="selected-${p.id}" ${s.selectedProducts.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label></th><td data-product-status></td><td data-product-cost></td></tr>`).join('')}</tbody></table></div></section>
</fieldset><div data-budget-results></div></form>`;
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
      } catch (error) { invalid = '入力は未保存です。結果は保存済みの条件です。' + errorText(error); }
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
