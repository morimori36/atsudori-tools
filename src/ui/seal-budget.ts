import {uiCheckbox} from './form-patterns';
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
  host.innerHTML=`<section class="panel"><div data-seal-results></div><p class="ui-help">30日換算の期待値です。Rメンバー・Rスナップは全て完凸、SR・SSRは未完凸と仮定します。イベントの余剰Ptは期限内にシール交換し、アワーノーツのPtは保有します。単月の獲得数は保証しません。</p></section>
   <form class="panel budget-conditions" id="seal-budget-form"><h2>試算条件</h2><p class="ui-help">変更は所持データへ自動保存</p><p class="ui-feedback" data-seal-message role="status"></p>
   <fieldset class="budget-form-body" ${state.protected?'disabled':''}><legend class="sr-only">シール予算の入力</legend>
   <fieldset class="ui-group"><legend>ガチャ</legend><p class="ui-help">有償ガチャは1日あたりの回数を選び、30日間続ける想定です。2回はパス特典の利用を前提とします。パス付属ガチャは週1回です。</p><div class="budget-checks">${d.gachas.filter(g=>g.id==='cm'||g.id==='pass').map(g=>uiCheckbox({id:'seal-'+g.id,name:g.id,label:g.name,checked:!!s[g.id]})).join('')}</div><div class="ui-fields">${d.gachas.filter(g=>g.id==='event'||g.id==='paid').map(g=>`<fieldset class="ui-group"><legend>${esc(g.name)}</legend><div class="seal-counts">${[0,1,2].map(n=>`<label class="ui-choice"><input type="radio" name="${g.id}" value="${n}" ${(s[g.id]??0)===n?'checked':''}><span>${n}回</span></label>`).join('')}</div></fieldset>`).join('')}</div></fieldset>
   <fieldset class="ui-group"><legend>毎月の全交換</legend><p class="ui-help">選択した商品の全価格段階を月上限まで計上します。</p><div class="budget-scroll" tabindex="0" role="region" aria-label="商品別の全交換条件"><table class="budget-products"><thead><tr><th scope="col">全交換する商品</th><th scope="col">シール/月</th></tr></thead><tbody>${d.products.map(p=>`<tr><th scope="row"><label class="ui-choice"><input type="checkbox" data-seal-product="${esc(p.id)}" ${s.selectedProducts.includes(p.id)?'checked':''}><span>${esc(p.name)}</span></label></th><td data-seal-cost="${esc(p.id)}"></td></tr>`).join('')}</tbody></table></div></fieldset></fieldset></form>`;
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
     ${r.notes.length?`<p>${r.notes.map(esc).join('。')}</p>`:''}`;
    for(const p of r.expenses){host.querySelector<HTMLElement>(`[data-seal-cost="${p.id}"]`)!.textContent=p.selected?num(p.total):'交換OFF';}
   }catch{target.innerHTML='<p role="alert">シール予算の定義・条件を確認してください。</p>';}
   changed();
  }
  const save=()=>{
   if(current().protected)return;
   const check=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).checked;
   try{
    const next={cm:check('cm'),pass:check('pass'),paid:Number((form.elements.namedItem('paid') as RadioNodeList).value) as 0|1|2,event:Number((form.elements.namedItem('event') as RadioNodeList).value) as 0|1|2,selectedProducts:[...form.querySelectorAll<HTMLInputElement>('[data-seal-product]:checked')].map(el=>el.dataset.sealProduct!)};
    calculateSealBudget(d,next);
    if(!persist({...current().collection,sealBudgetScenario:next}))throw new Error('ブラウザ保存に失敗しました。条件は未保存です。');invalid='';
   }catch(e){invalid=e instanceof Error?e.message:'条件は未保存です。';}
   display();
  };
  form.addEventListener('change',save);form.addEventListener('submit',e=>{e.preventDefault();save();});display();
 }
 return {mount,saveState:()=>({label:invalid?'シール予算 未保存の入力あり':'シール予算 自動保存',unsaved:!!invalid||current().unsaved||current().protected})};
}
