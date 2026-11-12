import type {Masterdata} from '../data/catalog/model';
import type {Collection} from '../storage/collection';
import {defaultSealBudgetScenario} from '../domain/seal-budget/model';
import {calculateCollectionSealBudget} from '../app/seal-budget';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]!);
const num = (value: number) => value.toLocaleString('ja-JP', {maximumFractionDigits: 2});
const signed = (value: number) => value > 0 ? `+${num(value)}` : num(value);
const sealMark = '<svg class="seal-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M7 4h26a3 3 0 0 1 3 3v19L26 36H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="currentColor"/><path d="M26 36v-7a3 3 0 0 1 3-3h7M12 17l5 5 11-11" fill="none" stroke="currentColor" class="seal-mark-fold" stroke-width="2.5"/></svg>';

export function createSealBudgetView(
  current: () => {master: Masterdata; collection: Collection; protected: boolean; unsaved: boolean; message: string},
  persist: (next: Collection) => boolean,
  changed: () => void,
) {
  let invalid = '';
  function mount(host: HTMLElement) {
    invalid = '';
    const state = current(), definition = state.master.sealBudgetDefinition;
    if (!definition) {
      host.innerHTML = '<section class="panel"><p>シール予算定義を含むマスタをJSON Import / Exportで登録してください。</p></section>';
      return;
    }
    const scenario = state.collection.sealBudgetScenario ?? defaultSealBudgetScenario();
    const help = {
      paid: 'Ptは保有し、シール収入に含めません',
      event: '余剰Ptを期限内にシール交換',
    };
    host.innerHTML = `<div class="seal-workspace">
      <aside class="seal-receipt" aria-labelledby="seal-receipt-heading">
        <div class="seal-receipt-heading">${sealMark}<h2 id="seal-receipt-heading">30日の収支票</h2><p>選択中の条件による期待値</p></div>
        <div data-seal-results></div>
        <p class="seal-expectation">30日換算の期待値です。<br>単月の獲得数は保証しません。</p>
      </aside>
      <form id="seal-budget-form" class="seal-editor">
        <p class="ui-feedback" data-seal-message role="status"></p>
        <fieldset class="seal-form-body" ${state.protected ? 'disabled' : ''}>
          <legend class="sr-only">シール予算の試算条件</legend>
          <div class="seal-section-heading"><h2>ガチャを選ぶ</h2><p>変更は所持データへ自動保存</p></div>
          <div class="seal-gachas">${definition.gachas.map(g => `<fieldset class="seal-gacha" data-seal-gacha="${g.id}">
            <legend class="sr-only">${esc(g.name)}</legend>
            <div class="seal-gacha-info"><h3>${esc(g.name)}</h3><p id="seal-${g.id}-help">${g.id === 'cm' || g.id === 'pass' ? `${num(g.periodDays)}日ごとに${num(g.draws)}回` : help[g.id]}</p></div>
            <div class="seal-gacha-control">${g.id === 'cm' || g.id === 'pass'
              ? `<label class="seal-toggle"><input type="checkbox" name="${g.id}" aria-describedby="seal-${g.id}-help" ${scenario[g.id] ? 'checked' : ''}><span>利用する</span></label>`
              : `<div class="seal-counts">${[0, 1, 2].map(n => `<label><input type="radio" name="${g.id}" value="${n}" aria-describedby="seal-${g.id}-help seal-count-help" ${(scenario[g.id] ?? 0) === n ? 'checked' : ''}><span>${n}回</span></label>`).join('')}</div><small>1日あたり</small>`}
            </div>
            <div class="seal-contribution" data-seal-contribution="${g.id}"></div>
          </fieldset>`).join('')}</div>
          <p class="ui-help seal-count-help" id="seal-count-help">有償ガチャは1日あたりの回数を選び、30日間続ける想定です。2回はパス特典の利用が前提です。パス購入状態とは自動連動しません。</p>
          <section class="seal-products" aria-labelledby="seal-products-heading">
            <div class="seal-section-heading"><h2 id="seal-products-heading">毎月の全交換</h2><p data-seal-selected></p></div>
            <p class="ui-help" id="seal-products-help">選んだ商品の全価格段階を月上限まで計上します。</p>
            <div class="seal-product-list">${definition.products.map(p => `<label class="seal-product">
              <input type="checkbox" data-seal-product="${esc(p.id)}" aria-describedby="seal-products-help" ${scenario.selectedProducts.includes(p.id) ? 'checked' : ''}>
              <span class="seal-product-name"><strong>${esc(p.name)}</strong><small>${p.tiers.map(t => `${t.sealCost === null ? '未確認' : num(t.sealCost)} × ${t.monthlyLimit === null ? '未確認' : num(t.monthlyLimit)}回`).join(' ＋ ')}</small></span>
              <span class="seal-product-cost"><span data-seal-cost="${esc(p.id)}"></span><small>シール / 月</small></span>
            </label>`).join('')}</div>
          </section>
        </fieldset>
      </form>
      <section class="seal-support" aria-label="収入の内訳と試算の前提">
        <details class="ui-details"><summary>ガチャ別収入の内訳<span>メンバー・スナップ・Pt交換</span></summary>
          <div class="budget-scroll" tabindex="0" role="region" aria-label="ガチャ別シール収入"><table class="seal-income-table">
            <caption>30日換算のシール収入期待値</caption>
            <thead><tr><th scope="col">ガチャ</th><th scope="col">メンバー</th><th scope="col">スナップ</th><th scope="col">Pt交換</th><th scope="col">合計/月</th></tr></thead>
            <tbody data-seal-breakdown></tbody>
          </table></div>
        </details>
        <details class="ui-details"><summary>試算の前提</summary><p>${definition.version === 2 ? '固定方式：Rメンバー・Rスナップは全て完凸、SR・SSRは未完凸と仮定します。' : '実所持方式：登録済みのメンバー・スナップと育成段階を、カード別の提供割合・重複変換条件に照合します。未所持は初回獲得、未完凸のピース等はシールに含めません。未知の寄与は除外します。試算中の所持状態は固定です。'}イベントの余剰Ptは期限内にシール交換し、アワーノーツのPtは保有します。イベント開催が継続する想定の30日換算で、実際の開催日数を予測しません。スター予算には連動しません。</p></details>
      </section>
      <div class="seal-mobile-balance" data-seal-mobile-balance aria-hidden="true" hidden></div>
    </div>`;
    const form = host.querySelector<HTMLFormElement>('form')!;
    const target = host.querySelector<HTMLElement>('[data-seal-results]')!;
    const mobile = host.querySelector<HTMLElement>('[data-seal-mobile-balance]')!;
    const breakdown = host.querySelector<HTMLElement>('[data-seal-breakdown]')!;

    function clearResults() {
      target.innerHTML = '';
      mobile.hidden = true;
      breakdown.innerHTML = '';
      for (const el of host.querySelectorAll('[data-seal-contribution], [data-seal-cost], [data-seal-selected]')) el.textContent = '';
    }
    function display() {
      const status = host.querySelector<HTMLElement>('[data-seal-message]')!, st = current();
      status.textContent = invalid || (st.protected ? '保存データを保護しています。JSON Import / Exportで復旧してください。' : st.message);
      status.classList.toggle('error-text', !!invalid || st.protected || st.unsaved);
      if (st.protected) {
        clearResults();
        target.innerHTML = '<p class="ui-help">保存データの復旧後に収支を表示します。</p>';
        changed();
        return;
      }
      try {
        // Results always use persisted conditions, including after a failed save.
        const savedScenario = st.collection.sealBudgetScenario ?? defaultSealBudgetScenario();
        const r = calculateCollectionSealBudget(st.master, st.collection, savedScenario);
        const stale = !!invalid || st.unsaved;
        const balanceClass = r.balance < 0 ? 'seal-shortfall' : r.balance > 0 ? 'seal-surplus' : '';
        target.innerHTML = `${stale ? '<p class="seal-stale">変更前の条件による結果です。各ガチャの収入・交換費用も変更前の条件です。</p>' : ''}
          <dl class="seal-receipt-math">
            <div><dt>月間収入期待値</dt><dd><span data-seal-income>${num(r.totalIncome)}</span><small>シール</small></dd></div>
            <div class="seal-expense"><dt>月間支出<span>${savedScenario.selectedProducts.length}商品</span></dt><dd><span class="seal-minus" aria-hidden="true">−</span><span data-seal-expense>${num(r.totalExpense)}</span><small>シール</small></dd></div>
            <div class="seal-balance ${balanceClass}"><dt>交換後の差引${r.balance < 0 ? '<span>不足</span>' : ''}</dt><dd><span data-seal-balance>${signed(r.balance)}</span><small>シール</small></dd></div>
          </dl>
          ${r.notes.length ? `<p class="seal-notes">${r.notes.map(esc).join('。')}</p>` : ''}`;
        for (const g of r.income) {
          host.querySelector<HTMLElement>(`[data-seal-contribution="${g.id}"]`)!.innerHTML = `<strong>${num(g.total)}</strong><small>シール / 30日${savedScenario[g.id] ? '' : '・未選択'}</small>`;
        }
        // Compare IDs as data, rather than interpolating external IDs into selectors.
        const costs = new Map(r.expenses.map(p => [p.id, p]));
        for (const el of host.querySelectorAll<HTMLElement>('[data-seal-cost]')) {
          const p = costs.get(el.dataset.sealCost!)!;
          el.textContent = p.selected ? num(p.total) : '交換OFF';
        }
        host.querySelector<HTMLElement>('[data-seal-selected]')!.textContent = `${savedScenario.selectedProducts.length} / ${definition!.products.length}商品を計上`;
        breakdown.innerHTML = r.income.map(g => `<tr><th scope="row">${esc(g.name)}</th><td>${num(g.member)}</td><td>${num(g.snap)}</td><td>${num(g.points)}</td><td>${num(g.total)}</td></tr>`).join('');
        mobile.innerHTML = `<span>${stale ? '変更前・' : ''}30日換算の差引${r.balance < 0 ? '（不足）' : ''}</span><strong class="${balanceClass}">${signed(r.balance)}<small>シール</small></strong>`;
        mobile.hidden = false;
      } catch {
        clearResults();
        target.innerHTML = '<p role="alert">シール予算の定義・条件を確認してください。</p>';
      }
      changed();
    }
    const save = () => {
      if (current().protected) return;
      const check = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
      try {
        const next = {
          cm: check('cm'), pass: check('pass'),
          paid: Number((form.elements.namedItem('paid') as RadioNodeList).value) as 0 | 1 | 2,
          event: Number((form.elements.namedItem('event') as RadioNodeList).value) as 0 | 1 | 2,
          selectedProducts: [...form.querySelectorAll<HTMLInputElement>('[data-seal-product]:checked')].map(el => el.dataset.sealProduct!),
        };
        calculateCollectionSealBudget(current().master, current().collection, next);
        if (!persist({...current().collection, sealBudgetScenario: next})) throw new Error('ブラウザ保存に失敗しました。条件は未保存です。');
        invalid = '';
      } catch (error) {
        invalid = error instanceof Error ? error.message : '条件は未保存です。';
      }
      display();
    };
    form.addEventListener('change', save);
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    display();
  }
  return {
    mount,
    saveState: () => ({label: invalid ? 'シール予算 未保存の入力あり' : 'シール予算 自動保存', unsaved: !!invalid || current().unsaved || current().protected}),
  };
}
