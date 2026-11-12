import { EVENT_INTERVAL_DAYS } from '../domain/supply-assumptions';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { TrainingSettingsStore } from '../storage/training-settings';
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
export function createEconomyView(
 context:()=>{master:Masterdata;collection:Collection;protected:boolean;message:string},
 persist:(next:Collection)=>boolean, training:TrainingSettingsStore, changed:()=>void,
){
 let dirty=false, message='';
 let draft:Record<string,string|boolean>={};
 function mount(host:HTMLElement):void {
  const state=context(), {master,collection}=state;
  const conditions=collection.supplyConditions??defaultSupplyConditions();
  const purchases=collection.starBudgetScenario??defaultStarBudgetScenario();
  const field=(name:string,label:string,value:number|null|undefined)=>uiNumberField({id:'economy-'+name,name,label,value:value??null,min:name==='lb'?0:1,max:Number.MAX_SAFE_INTEGER});
  const toggle=(name:string,label:string,checked:boolean)=>uiCheckbox({id:'economy-'+name,name,label,checked});
  let result:ReturnType<typeof simulateEconomy>|undefined;
  try{if(!state.protected&&!training.damaged())result=simulateEconomy(master,collection,training.current());}catch(e){message=String(e);}
  const results=()=>{
   if(!result)return '';
   const rows=new Map(result.rows.map(row=>[row.resource.id,row]));
   const reasons=[...new Set([...result.issues.map(i=>i.reason),...result.pendingRequirements.map(i=>`${i.kind} #${i.cardId} / ${i.axis}: ${i.reason}`)])];
   const omitted=[result.requirementsIncomplete?'未確認の需要':null,result.rows.some(r=>r.stock===null)?'未登録在庫':null,result.issues.length?'未確認の供給':null].filter(Boolean);
   return `<section class="panel economy-results" aria-labelledby="economy-results-heading"><h2 id="economy-results-heading">素材別の充足日数</h2>
    <p class="ui-help">日平均の概算です。抽選は期待値です。</p><p data-result-state class="ui-feedback" role="status">${dirty?'入力は未反映です。変更前の条件による結果です。':''}</p>
    <div class="economy-table-wrap" role="region" aria-label="素材別の充足日数" tabindex="0"><table class="economy-table"><thead><tr>${['素材','必要量','現在庫','不足量','日平均供給','充足日数'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${resourcesForDisplay(result.rows.map(x=>x.resource)).map(resource=>rows.get(resource.id)!).map(x=>`<tr data-economy-resource="${esc(x.resource.id)}"><th scope="row">${esc(x.resource.name)}</th><td>${num(x.required)}</td><td>${num(x.stock??0)}</td><td>${num(x.shortage)}</td><td>${num(x.dailySupply)}</td><td>${x.status==='unreachable'?'現在の条件では充足不可':num(x.clearanceDays)+'日'}</td></tr>`).join('')}</tbody></table></div>
    ${omitted.length?`<p class="ui-help">${omitted.join('・')}は計算上0としています。充足日数は長めにも短めにもなりえます。</p>`:''}
    ${reasons.length?`<ul class="economy-warnings">${reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}</section>`;
  };
  host.innerHTML=trainingSettingsMarkup(training)+`
   <section class="panel economy-conditions" aria-labelledby="economy-conditions-heading"><h2 id="economy-conditions-heading">試算条件</h2>
    ${state.protected?'<p class="warning" role="alert">マスタ・所持データを保護中です。JSON Import / Exportで復旧してください。</p>':''}
    <p class="ui-feedback" data-economy-message role="status">${esc(message||state.message)}</p>
    <form id="economy-form"><fieldset ${state.protected?'disabled':''}><legend class="sr-only">素材供給の入力</legend>
     <div class="economy-fields ui-fields">${field('rank','T.G.Wランク',collection.tgwRank)}</div>
     <fieldset class="economy-group ui-group"><legend>通常ライブ</legend><div class="economy-fields ui-fields">${field('lb','LB消費量 / 日',conditions.lbPerDay)}
      <div class="field"><label for="economy-score-rank">ライブのスコアランク</label><select id="economy-score-rank" name="scoreRank"><option value="">未設定</option>${conditions.scoreRank&&!master.supplyDefinition?.lives.some(r=>r.mode==='play'&&r.scoreRank===conditions.scoreRank)?`<option value="${esc(conditions.scoreRank)}" selected>${esc(conditions.scoreRank)}（未登録）</option>`:''}${[...new Set(master.supplyDefinition?.lives.filter(r=>r.mode==='play').map(r=>r.scoreRank))].map(rank=>`<option value="${esc(rank)}" ${rank===conditions.scoreRank?'selected':''}>${esc(rank)}</option>`).join('')}</select></div>
     </div></fieldset>
     <fieldset class="economy-group ui-group"><legend>スタジオ</legend><div class="economy-fields ui-fields">${master.bands.map(b=>field('band-'+b.id,b.name+' 練習Lv',conditions.studioLevels.find(x=>x.bandId===b.id)?.level)).join('')}</div></fieldset>
     <fieldset class="economy-group ui-group"><legend>その他の継続供給</legend>${toggle('eventPremium','イベントミッションPremiumを購入',purchases.eventPremium)}${toggle('seasonPremium','シーズンミッションPremiumを購入',purchases.seasonPremium)}</fieldset>
     <p class="ui-help">イベントは${EVENT_INTERVAL_DAYS}日ごとに切り替わり、継続開催されるものとして計算します。</p>
    </fieldset></form>
   </section><div data-economy-results>${results()}</div>`;
  const form=host.querySelector<HTMLFormElement>('#economy-form')!;
  const inputs=()=>[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')];
  for(const el of inputs()){
   const value=draft[el.name];if(value===undefined)continue;
   if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=value===true;else el.value=String(value);
  }
  const feedback=(text:string)=>{
   host.querySelector('[data-economy-message]')!.textContent=text;
   const stale=host.querySelector('[data-result-state]');if(stale)stale.textContent=dirty?'入力は未反映です。変更前の条件による結果です。':'';
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
    host.querySelector('[data-economy-results]')!.innerHTML=results();feedback(message);
   }catch(e){message=e instanceof Error?e.message:String(e);feedback(message);}
  }
  form.oninput=e=>{if((e.target as HTMLInputElement).type==='number')commit(e.target as HTMLInputElement);};
  form.onchange=e=>commit(e.target as HTMLInputElement|HTMLSelectElement);form.onsubmit=e=>{e.preventDefault();commit();};
  form.addEventListener('wheel',e=>{if(document.activeElement instanceof HTMLInputElement&&form.contains(document.activeElement))e.preventDefault();},{passive:false});
  if(dirty)feedback(message||'未反映の入力を保持しています。');
  bindTrainingSettings(host.closest<HTMLElement>('#app')??host,training);changed();
 }
 return {mount,clearDraft:()=>{draft={};dirty=false;message='';},saveState:()=>({label:dirty?'未反映の試算条件あり':'試算条件',unsaved:dirty})};
}
