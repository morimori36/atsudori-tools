import type {Masterdata} from '../data/catalog/model';
import type {Collection} from '../storage/collection';
import {defaultSealBudgetScenario} from '../domain/seal-budget/model';
import {calculateSealBudget} from '../domain/seal-budget/calculate';
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const num=(n:number)=>n.toLocaleString('ja-JP',{maximumFractionDigits:2});
export function createSealBudgetView(current:()=>{master:Masterdata;collection:Collection;protected:boolean;unsaved:boolean;message:string},persist:(next:Collection)=>boolean,changed:()=>void){
 let invalid='';
 function mount(host:HTMLElement){
  invalid='';const state=current(),d=state.master.sealBudgetDefinition;
  if(!d){host.innerHTML='<section class="panel"><p>シール予算定義を含むマスタをJSON Import / Exportで登録してください。</p></section>';return;}
  const s=state.collection.sealBudgetScenario??defaultSealBudgetScenario();
  host.innerHTML=`<section class="panel"><div data-seal-results></div><p class="ui-help">30日換算の期待値です。Rメンバー・Rスナップは全て完凸、SR・SSRは未完凸と仮定します。単月の獲得数は保証しません。</p></section>
   <form class="panel" id="seal-budget-form"><h2>試算条件</h2><p class="ui-help">変更は所持データへ自動保存</p><p data-seal-message role="status"></p>
   <fieldset ${state.protected?'disabled':''}><legend>ガチャ</legend>${d.gachas.map(g=>g.id==='paid'?`<label>${esc(g.name)}<select name="paid" aria-label="${esc(g.name)}">${[0,1,2].map(n=>`<option value="${n}" ${s.paid===n?'selected':''}>${n}回/日</option>`).join('')}</select></label>`:`<label><input type="checkbox" name="${g.id}" ${s[g.id]?'checked':''}>${esc(g.name)}</label>`).join('')}</fieldset>
   <fieldset ${state.protected?'disabled':''}><legend>月上限まで交換</legend>${d.products.map(p=>`<label><input type="checkbox" data-seal-product="${esc(p.id)}" ${s.selectedProducts.includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</fieldset></form>`;
  const form=host.querySelector<HTMLFormElement>('form')!;
  function display(){
   const status=host.querySelector<HTMLElement>('[data-seal-message]')!,st=current();
   status.textContent=invalid||(st.protected?'保存データを保護しています。JSON Import / Exportで復旧してください。':st.message);
   status.classList.toggle('error-text',!!invalid||st.protected||st.unsaved);
   const target=host.querySelector<HTMLElement>('[data-seal-results]')!;
   if(st.protected){target.innerHTML='';changed();return;}
   try{
    const r=calculateSealBudget(d!,st.collection.sealBudgetScenario??defaultSealBudgetScenario());
    target.innerHTML=`<h2>シール月次収支</h2><dl><dt>月間収入期待値</dt><dd data-seal-income>${num(r.totalIncome)}</dd><dt>月間支出</dt><dd data-seal-expense>${num(r.totalExpense)}</dd><dt>月間収支</dt><dd data-seal-balance>${num(r.balance)}</dd></dl>
     ${invalid?'<p>以下は変更前の条件による結果です。</p>':''}
     <h3>ガチャ別収入</h3><div class="budget-scroll" tabindex="0" role="region" aria-label="ガチャ別シール収入"><table><thead><tr><th>ガチャ</th><th>Rメンバー</th><th>Rスナップ</th><th>Pt交換</th><th>合計/月</th></tr></thead><tbody>${r.income.map(g=>`<tr><th scope="row">${esc(g.name)}</th><td>${num(g.member)}</td><td>${num(g.snap)}</td><td>${num(g.points)}</td><td>${num(g.total)}</td></tr>`).join('')}</tbody></table></div>
     ${r.expenses.some(p=>p.selected)?`<h3>交換商品別支出</h3><ul>${r.expenses.filter(p=>p.selected).map(p=>`<li>${esc(p.name)}: ${num(p.total)}</li>`).join('')}</ul>`:''}
     ${r.notes.length?`<p>${r.notes.map(esc).join('。')}</p>`:''}`;
   }catch{target.innerHTML='<p role="alert">シール予算の定義・条件を確認してください。</p>';}
   changed();
  }
  const save=()=>{
   if(current().protected)return;
   const check=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).checked;
   try{
    const next={cm:check('cm'),pass:check('pass'),paid:Number((form.elements.namedItem('paid') as HTMLSelectElement).value) as 0|1|2,selectedProducts:[...form.querySelectorAll<HTMLInputElement>('[data-seal-product]:checked')].map(el=>el.dataset.sealProduct!)};
    calculateSealBudget(d,next);
    if(!persist({...current().collection,sealBudgetScenario:next}))throw new Error('ブラウザ保存に失敗しました。条件は未保存です。');invalid='';
   }catch(e){invalid=e instanceof Error?e.message:'条件は未保存です。';}
   display();
  };
  form.addEventListener('change',save);form.addEventListener('submit',e=>{e.preventDefault();save();});display();
 }
 return {mount,saveState:()=>({label:invalid?'シール予算 未保存の入力あり':'シール予算 自動保存',unsaved:!!invalid||current().unsaved||current().protected})};
}
