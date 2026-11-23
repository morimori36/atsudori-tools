import { EVENT_INTERVAL_DAYS } from '../domain/supply-assumptions';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { TrainingSettingsStore } from '../storage/training-settings';
import type { Certainty } from '../domain/economy/model';
import { defaultSupplyConditions } from '../domain/economy/model';
import { validateSupplyConditions } from '../domain/economy/validate';
import { defaultStarBudgetScenario } from '../domain/star-budget/model';
import { simulateEconomy } from '../app/economy-simulation';
import { trainingSettingsMarkup, bindTrainingSettings } from './training-settings';
import { uiNumberField, uiCheckbox } from './form-patterns';
import './form-patterns.css';
import { resourcesForDisplay } from './resource-order';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const num=(v:number|null)=>v===null?'未確認':v.toLocaleString('ja-JP',{maximumFractionDigits:3});
type Simulation = ReturnType<typeof simulateEconomy>;
type MaterialRow = Simulation['rows'][number];

const quantities = ['必要量', '現在庫', '不足量', '日平均供給', '充足日数'] as const;
const certaintyLabels: Record<Certainty, string> = {confirmed:'平均',expected:'抽選期待値',estimated:'イベント推計'};
const clearance = (row: MaterialRow) => row.status==='unreachable'?'現在の条件では充足不可':num(row.clearanceDays)+'日';
const previousResult = '入力は未反映です。変更前の条件による結果です。';

function materialResults(rows: MaterialRow[]): string {
 const rowValues = (row: MaterialRow) => [
  num(row.required),
  row.stock===null?'0<small class="economy-stock-note">未登録</small>':num(row.stock),
  num(row.shortage),
  num(row.dailySupply),
  clearance(row),
 ];
 if(!rows.length)return '<p class="ui-help">試算対象の素材がありません。素材定義を含むマスタをImportしてください。</p>';
 return `<div class="economy-table-wrap" role="region" aria-label="素材別の充足日数の比較表" tabindex="0">
  <table class="economy-table"><caption class="sr-only">素材ごとの必要量・在庫・供給と充足日数</caption>
  <thead><tr>${['素材',...quantities].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(row=>`<tr data-economy-resource="${esc(row.resource.id)}"><th scope="row">${esc(row.resource.name)}</th>${rowValues(row).map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <ul class="economy-materials" role="list" aria-label="素材別の充足日数">${rows.map(row=>{
   const values=rowValues(row);
   return `<li><div class="economy-material-heading"><h3>${esc(row.resource.name)}</h3><strong><span class="sr-only">充足日数 </span>${values[4]}</strong></div>
   <dl>${[2,3,0,1].map(index=>`<div><dt>${quantities[index]}</dt><dd>${values[index]}</dd></div>`).join('')}</dl></li>`;
  }).join('')}</ul>`;
}

export function createEconomyView(
 context:()=>{master:Masterdata;collection:Collection;protected:boolean;message:string},
 persist:(next:Collection)=>boolean, training:TrainingSettingsStore, changed:()=>void,
){
 let dirty=false, message='';
 let draft:Record<string,string|boolean>={};
 let previewMaterial='', breakdownMaterial='';
 let goalsOpen=false, reasonsOpen=false, breakdownOpen=false;
 function mount(host:HTMLElement):void {
  const state=context(), {master,collection}=state;
  const conditions=collection.supplyConditions??defaultSupplyConditions();
  const purchases=collection.starBudgetScenario??defaultStarBudgetScenario();
  const field=(name:string,label:string,value:number|null|undefined)=>uiNumberField({id:'economy-'+name,name,label,value:value??null,min:name==='lb'?0:1,max:Number.MAX_SAFE_INTEGER});
  const toggle=(name:string,label:string,checked:boolean)=>uiCheckbox({id:'economy-'+name,name,label,checked});
  let result:ReturnType<typeof simulateEconomy>|undefined;
  try{if(!state.protected&&!training.damaged())result=simulateEconomy(master,collection,training.current());}catch(e){message=String(e);}
  const locked=state.protected||training.damaged();
  host.innerHTML=`
   <details class="economy-goals ui-details" ${goalsOpen?'open':''}><summary>育成目標を確認・変更</summary>${trainingSettingsMarkup(training)}</details>
   <section class="panel economy-results" aria-labelledby="economy-results-heading">
    <div class="economy-result-heading"><h2 id="economy-results-heading">素材別の充足日数</h2><button type="button" class="primary" data-economy-open aria-haspopup="dialog">試算条件を編集</button></div>
    <p class="ui-help">日平均の概算です。抽選は期待値です。</p>
    ${locked?`<p class="warning" role="alert">${state.protected?'マスタ・所持データを保護中です。JSON Import / Exportで復旧してください。':'育成条件を保護中です。「育成条件を変更」から復旧してください。'}</p>`:''}
    <p data-result-state class="ui-feedback" role="status"></p>
    <div class="economy-notices" data-economy-notices>
     <p class="ui-help" data-economy-omitted></p>
     <details class="ui-details" data-economy-reasons><summary>未確認の理由</summary><ul class="economy-warnings"></ul></details>
    </div>
    <div data-economy-results></div>
    <details class="economy-breakdown ui-details" data-economy-breakdown>
     <summary>日平均供給の内訳</summary>
     <label for="economy-breakdown-material">内訳を見る素材</label><select id="economy-breakdown-material"></select>
     <div data-economy-sources></div>
    </details>
   </section>
   <dialog class="economy-dialog" aria-labelledby="economy-conditions-heading">
    <div class="economy-conditions">
     <h2 id="economy-conditions-heading">試算条件</h2>
     ${locked?'<p class="warning">保存データ・育成条件を復旧してください。</p>':''}
     <p class="ui-feedback" data-economy-message role="status">${esc(message||state.message)}</p>
    <form id="economy-form"><fieldset ${locked?'disabled':''}><legend class="sr-only">素材供給の入力</legend>
     <div class="economy-fields ui-fields">${field('rank','T.G.Wランク',collection.tgwRank)}</div>
     <fieldset class="economy-group ui-group"><legend>通常ライブ</legend><div class="economy-fields ui-fields">${field('lb','LB消費量 / 日',conditions.lbPerDay)}
      <div class="field"><label for="economy-score-rank">ライブのスコアランク</label><select id="economy-score-rank" name="scoreRank"><option value="">未設定</option>${conditions.scoreRank&&!master.supplyDefinition?.lives.some(r=>r.mode==='play'&&r.scoreRank===conditions.scoreRank)?`<option value="${esc(conditions.scoreRank)}" selected>${esc(conditions.scoreRank)}（未登録）</option>`:''}${[...new Set(master.supplyDefinition?.lives.filter(r=>r.mode==='play').map(r=>r.scoreRank))].map(rank=>`<option value="${esc(rank)}" ${rank===conditions.scoreRank?'selected':''}>${esc(rank)}</option>`).join('')}</select></div>
     </div></fieldset>
     <fieldset class="economy-group ui-group"><legend>スタジオ</legend><div class="economy-fields ui-fields">${master.bands.map(b=>field('band-'+b.id,b.name+' 練習Lv',conditions.studioLevels.find(x=>x.bandId===b.id)?.level)).join('')}</div></fieldset>
     <fieldset class="economy-group ui-group"><legend>その他の継続供給</legend>${toggle('eventPremium','イベントミッションPremiumを購入',purchases.eventPremium)}${toggle('seasonPremium','シーズンミッションPremiumを購入',purchases.seasonPremium)}</fieldset>
     <p class="ui-help">イベントは${EVENT_INTERVAL_DAYS}日ごとに切り替わり、継続開催されるものとして計算します。</p>
    </fieldset></form>
    </div>
    <div class="economy-dialog-footer">
     <label class="economy-preview-label" for="economy-preview-material">確認する素材
      <select id="economy-preview-material"></select>
     </label>
     <output class="economy-preview" data-economy-preview></output>
     <button class="secondary" type="button" data-economy-close>閉じる</button>
    </div>
   </dialog>`;
  const goals=host.querySelector<HTMLDetailsElement>('.economy-goals')!;
  goals.ontoggle=()=>{goalsOpen=goals.open;};
  const dialog=host.querySelector<HTMLDialogElement>('.economy-dialog')!;
  host.querySelector<HTMLButtonElement>('[data-economy-open]')!.onclick=()=>dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-economy-close]')!.onclick=()=>dialog.close();
  const previewSelect=host.querySelector<HTMLSelectElement>('#economy-preview-material')!;
  const preview=host.querySelector<HTMLOutputElement>('[data-economy-preview]')!;
  const breakdownSelect=host.querySelector<HTMLSelectElement>('#economy-breakdown-material')!;
  const breakdown=host.querySelector<HTMLDetailsElement>('[data-economy-breakdown]')!;
  const reasons=host.querySelector<HTMLDetailsElement>('[data-economy-reasons]')!;
  const resultHost=host.querySelector<HTMLElement>('[data-economy-results]')!;
  let rows: MaterialRow[]=[];
  reasons.open=reasonsOpen;
  breakdown.open=breakdownOpen;
  reasons.ontoggle=()=>{reasonsOpen=reasons.open;};
  breakdown.ontoggle=()=>{breakdownOpen=breakdown.open;if(breakdownOpen)renderBreakdown();};

  function renderPreview() {
   const row=rows.find(item=>item.resource.id===previewSelect.value);
   preview.hidden=!row;
   previewSelect.closest('label')!.hidden=!row;
   if(!row){preview.replaceChildren();return;}
   const partial=result?.requirementsIncomplete||row.supplyIncomplete||row.stock===null;
   preview.innerHTML=`<span>充足日数</span><strong>${clearance(row)}</strong>
    <small>不足 ${num(row.shortage)} ／ 供給 ${num(row.dailySupply)} / 日</small>
    ${partial?'<small class="economy-preview-warning">未確認分を計算上0とした概算</small>':''}
    ${dirty?`<small class="economy-preview-warning">${previousResult}</small>`:''}`;
  }

  function renderBreakdown() {
   if(!breakdown.open)return;
   const sources=result?.breakdown.filter(entry=>entry.resourceId===breakdownSelect.value&&entry.destination==='inventory'&&entry.dailyQuantity>0)??[];
   host.querySelector('[data-economy-sources]')!.innerHTML=sources.length
    ? `<ul class="economy-sources" role="list">${sources.map(source=>`<li><span>${esc(source.sourceName)} <small>（${certaintyLabels[source.certainty]}）</small></span><strong>${num(source.dailyQuantity)} / 日</strong></li>`).join('')}</ul>`
    : '<p class="ui-help">計算に含まれる日平均供給はありません。</p>';
  }

  function renderResults() {
   const byId=new Map(result?.rows.map(row=>[row.resource.id,row]));
   rows=resourcesForDisplay(result?.rows.map(row=>row.resource)??[]).map(resource=>byId.get(resource.id)!);
   const table=resultHost.querySelector('.economy-table-wrap');
   const top=table?.scrollTop??0, left=table?.scrollLeft??0;
   resultHost.innerHTML=result?materialResults(rows):locked?'':`<p class="warning" role="alert">${esc(message)}</p>`;
   resultHost.querySelector('.economy-table-wrap')?.scrollTo(left,top);
   const omitted=[result?.requirementsIncomplete?'未確認の需要':null,rows.some(row=>row.stock===null)?'未登録在庫':null,result?.issues.length?'未確認の供給':null].filter(Boolean);
   const notices=host.querySelector<HTMLElement>('[data-economy-notices]')!;
   notices.hidden=!omitted.length;
   host.querySelector('[data-economy-omitted]')!.textContent=omitted.length
    ? omitted.join('・')+'は計算上0としています。充足日数は長めにも短めにもなりえます。':'';
   const reasonList=[...new Set([
    ...(result?.issues.map(issue=>issue.reason)??[]),
    ...(result?.pendingRequirements.map(issue=>`${issue.kind} #${issue.cardId} / ${issue.axis}: ${issue.reason}`)??[]),
    ...rows.filter(row=>row.stock===null).map(row=>`${row.resource.name}の在庫が未登録です。`),
   ])];
   reasons.hidden=!reasonList.length;
   reasons.querySelector('ul')!.innerHTML=reasonList.map(reason=>`<li>${esc(reason)}</li>`).join('');
   const options=rows.map(row=>`<option value="${esc(row.resource.id)}">${esc(row.resource.name)}</option>`).join('');
   for(const [select,preferred] of [[previewSelect,previewMaterial],[breakdownSelect,breakdownMaterial]] as const){
    if(select.innerHTML!==options)select.innerHTML=options;
    select.value=byId.has(preferred)?preferred:rows[0]?.resource.id??'';
   }
   breakdown.hidden=!rows.length;
   renderBreakdown();
  }
  previewSelect.onchange=()=>{previewMaterial=previewSelect.value;renderPreview();};
  breakdownSelect.onchange=()=>{breakdownMaterial=breakdownSelect.value;renderBreakdown();};
  renderResults();
  const form=host.querySelector<HTMLFormElement>('#economy-form')!;
  const inputs=()=>[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')];
  for(const el of inputs()){
   const value=draft[el.name];if(value===undefined)continue;
   if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=value===true;else el.value=String(value);
  }
  const feedback=(text:string)=>{
   host.querySelector('[data-economy-message]')!.textContent=text;
   host.querySelector('[data-result-state]')!.textContent=dirty&&result?previousResult:'';
   renderPreview();
   changed();
  };
  function commit(edited?:HTMLInputElement|HTMLSelectElement):void {
   // Untouched fields must come from the latest collection on the next mount.
   if(edited)draft[edited.name]=edited instanceof HTMLInputElement&&edited.type==='checkbox'?edited.checked:edited.value;
   dirty=true;
   try{
    const current=context();if(current.protected||training.damaged())throw Error('保存データ・育成条件を復旧してください');
    const number=(name:string,nullable=false):number|null=>{
     const el=form.elements.namedItem(name) as HTMLInputElement;
     const ok=el.value===''&&nullable&&!el.validity.badInput||/^\d+$/.test(el.value)&&el.validity.valid&&Number.isSafeInteger(Number(el.value));
     el.setAttribute('aria-invalid',String(!ok));
     if(!ok)throw Error('整数の入力を確認してください');
     return el.value===''?null:Number(el.value);
    };
    const lbPerDay=number('lb')!, rank=number('rank',true);
    const studioLevels=master.bands.flatMap(b=>{const level=number('band-'+b.id,true);return level===null?[]:[{bandId:b.id,level}];});
    for(const row of studioLevels){if(!master.supplyDefinition?.studios.some(s=>s.bandId===row.bandId&&s.level===row.level)){
     form.querySelector(`[name="band-${row.bandId}"]`)!.setAttribute('aria-invalid','true');throw Error('指定した練習Lvの報酬定義がありません');
    }}
    const supplyConditions=validateSupplyConditions({lbPerDay,scoreRank:String(new FormData(form).get('scoreRank')??'')||null,studioLevels});
    const {tgwRank:previousRank,...rest}=current.collection;void previousRank;
    const next:Collection={...rest,...(rank===null?{}:{tgwRank:rank}),supplyConditions,starBudgetScenario:{...(current.collection.starBudgetScenario??defaultStarBudgetScenario()),eventPremium:(form.elements.namedItem('eventPremium') as HTMLInputElement).checked,seasonPremium:(form.elements.namedItem('seasonPremium') as HTMLInputElement).checked}};
    const calculated=simulateEconomy(master,next,training.current());
    if(!persist(next))throw Error(context().message||'条件を保存できません。入力を保持しています。');
    dirty=false;draft={};result=calculated;message='自動保存しました';
    renderResults();feedback(message);
   }catch(e){message=e instanceof Error?e.message:String(e);feedback(message);}
  }
  form.oninput=e=>{if((e.target as HTMLInputElement).type==='number')commit(e.target as HTMLInputElement);};
  form.onchange=e=>commit(e.target as HTMLInputElement|HTMLSelectElement);form.onsubmit=e=>{e.preventDefault();commit();};
  form.addEventListener('wheel',e=>{if(e.target===document.activeElement&&e.target instanceof HTMLInputElement&&e.target.type==='number')e.preventDefault();},{passive:false});
  if(dirty)feedback(message||'未反映の入力を保持しています。');else renderPreview();
  bindTrainingSettings(host.closest<HTMLElement>('#app')??host,training);changed();
 }
 return {mount,clearDraft:()=>{draft={};dirty=false;message='';},saveState:()=>({label:dirty?'未反映の試算条件あり':'試算条件',unsaved:dirty})};
}
