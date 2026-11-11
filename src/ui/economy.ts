import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { StoragePort } from '../storage/local';
import type { TrainingSettingsStore } from '../storage/training-settings';
import { createEconomyStore } from '../storage/economy';
import { emptyEconomyScenario,importEconomyScenario,exportEconomyScenario } from '../domain/economy/validate';
import { simulateEconomy } from '../app/economy-simulation';
import { trainingSettingsMarkup,bindTrainingSettings } from './training-settings';
import { uiNumberField,uiCheckbox } from './form-patterns';
import './form-patterns.css';
import { resourcesForDisplay } from './resource-order';
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const num=(v:number|null)=>v===null?'未確認':v.toLocaleString('ja-JP',{maximumFractionDigits:3});
export function createEconomyView(storage:StoragePort|undefined,context:()=>{master:Masterdata;collection:Collection;protected:boolean},training:TrainingSettingsStore,download:(text:string,name:string)=>void,changed:()=>void){
 const initial=()=>{const s=emptyEconomyScenario(context().master.catalogId);s.rank=context().collection.tgwRank??null;return s;};
 const store=createEconomyStore(storage,initial());let message='',dirty=false;let draft:Record<string,string|boolean>={};
 const field=(name:string,label:string,value:number|null|undefined,help?:string)=>uiNumberField({id:'economy-'+name,name,label,value:value??null,min:name==='rank'||name==='interval'||name.startsWith('band-')?1:0,max:name==='skipPercent'||name.startsWith('fixed-')?100:name==='minutes'?1440:name==='interval'?5270400:Number.MAX_SAFE_INTEGER,help});
 function mount(host:HTMLElement):void{
 const {master,collection}=context();let s=store.current();if(store.fresh()&&!dirty&&s.catalogId!==master.catalogId)s=initial();
 const d=master.supplyDefinition;
 const options=(mode:string,id:string|null)=>`<option value="">未設定</option>${d?.lives.filter(r=>r.mode===mode).map(r=>`<option value="${esc(r.id)}" ${r.id===id?'selected':''}>${esc(r.name)}</option>`).join('')??''}`;
 let result:ReturnType<typeof simulateEconomy>|undefined;
 try{if(!context().protected&&!store.protected()&&!training.damaged())result=simulateEconomy(master,collection,training.current(),s);}catch(e){message=String(e);}
 const table=(r:NonNullable<typeof result>)=>`<p class="ui-scroll-hint">横にスクロールして全6列を確認できます。</p><div class="economy-table-wrap" role="region" aria-label="素材別の充足日数" tabindex="0"><table class="economy-table"><caption>確定した試算条件による素材別の充足日数</caption><thead><tr>${['素材','必要量','現在庫','不足量','日平均供給','充足日数'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${resourcesForDisplay(r.rows.map(x=>x.resource)).map(resource=>r.rows.find(row=>row.resource.id===resource.id)!).map(x=>`<tr data-economy-resource="${esc(x.resource.id)}"><th scope="row">${esc(x.resource.name)}</th><td>${x.required===null?'未確認（小計 '+num(x.requiredSubtotal)+'）':num(x.required)}</td><td>${x.stock===null?'未登録':num(x.stock)}</td><td>${num(x.shortage)}</td><td>${x.dailySupply===null?'未確認（小計 '+num(x.knownDailySupply)+'）':num(x.dailySupply)}</td><td>${x.status==='unreachable'?'現在の条件では充足不可':x.status==='unknown'?'算出不可':num(x.clearanceDays)+'日'}</td></tr>`).join('')}</tbody></table></div>`;
 const details=(r:NonNullable<typeof result>)=>`<details><summary>日平均供給の内訳・根拠</summary><ul>${r.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul><div class="economy-table-wrap"><table class="economy-table"><thead><tr><th>供給源</th><th>素材・権利</th><th>日平均</th><th>区分</th><th>受取先</th><th>根拠</th></tr></thead><tbody>${r.breakdown.map(e=>`<tr><td>${esc(e.sourceName)}</td><td>${esc(master.materialDefinition?.resources.find(x=>x.id===e.resourceId)?.name??e.resourceId)}</td><td>${num(e.dailyQuantity)}</td><td>${{confirmed:'確認済み報酬の平均',expected:'抽選期待値',estimated:'イベント推計'}[e.certainty]}</td><td>${{inventory:'在庫',direct:'直接付与（在庫対象外）',entitlement:'権利（素材換算なし）'}[e.destination]}</td><td>${esc(e.basis)}</td></tr>`).join('')}</tbody></table></div></details>`;
 const toggle=(name:string,label:string,checked:boolean)=>uiCheckbox({id:'economy-'+name,name,label,checked});
 const resultsMarkup=()=>`${result?`<section class="panel economy-results" aria-labelledby="economy-results-heading"><h2 id="economy-results-heading" tabindex="-1">素材別の充足日数</h2><button type="button" class="secondary" data-economy-jump="economy-conditions-heading">試算条件を調整</button><p data-result-state class="ui-feedback" role="status"></p>
  <div class="economy-result-notes"><span>日平均の概算</span><span>抽選は期待値</span><span>イベントは推計</span></div>
  ${table(result)}
  ${result.issues.length||result.pendingRequirements.length?`<details class="economy-warnings" open><summary>未確認事項（${result.issues.length+result.pendingRequirements.length}）</summary><ul>${result.issues.map(i=>`<li>${esc(i.reason)}</li>`).join('')}${result.pendingRequirements.map(i=>`<li>${esc(i.kind)} #${i.cardId} / ${esc(i.axis)}: ${esc(i.reason)}</li>`).join('')}</ul></details>`:''}
  <details class="economy-help ui-details"><summary>試算の前提・結果の読み方</summary><p>日平均供給が続く場合の概算です。イベントは全回収報酬÷想定開催間隔の推計です。一度きり・課金・期間限定報酬は対象外です。在庫や必要量に未確認がある素材は充足日数を算出しません。</p></details>
  ${details(result)}<button class="secondary" data-result-export>結果・前提をExport</button>
 </section>`:''}`;
 host.innerHTML=trainingSettingsMarkup(training)+`<div data-economy-results>${resultsMarkup()}</div>
 <section class="panel economy-conditions" aria-labelledby="economy-conditions-heading">
  <h2 id="economy-conditions-heading" tabindex="-1">試算条件</h2><button type="button" class="secondary" data-economy-jump="economy-results-heading">結果へ戻る</button><p class="ui-help">有効な条件は自動保存・再計算します。所持・在庫は変更しません。</p>
  ${context().protected?'<p class="warning" role="alert">マスタ・所持データを保護中です。JSON Import / Exportで復旧してください。</p>':''}
  <p class="ui-feedback" data-economy-message role="status">${esc(message||store.message())}</p>
  ${store.protected()?'<p class="warning">旧形式・破損条件の元JSONを保護しています。v5条件をImportまたは初期化してください。</p><button class="secondary" data-original>元JSONをExport</button>':''}
  <form id="economy-form">
   <fieldset class="economy-group ui-group"><legend>ランク・イベント</legend>
    <div class="economy-fields ui-fields">${field('rank','T.G.Wランク',s.rank,'空欄は不明です。キャラランクとは別の条件です。')}
     <div class="economy-options">${toggle('rankDaily','ランクのデイリー報酬を含む',s.includeRankDaily)}${toggle('includeEvents','標準イベントの全回収供給を含む',s.includeEvents)}
      <span class="economy-note">暫定の想定開催間隔：${d?.standardEvent?.intervalDays??'未登録'}日</span>
     </div>
    </div>
    <details class="economy-help ui-details"><summary>イベントの前提</summary><p>${esc(d?.standardEvent?.basis??'開催頻度・標準報酬は外部定義が必要です。')}</p></details>
   </fieldset>
   <fieldset class="economy-group ui-group"><legend>ライブ・スキップ</legend>
    ${toggle('live','供給を含む',s.live.enabled)}
    <div class="economy-fields ui-fields">${field('lb','LB消費 / 日',s.live.lbPerDay,'1日に消費するLBの合計です。')}${field('skipPercent','スキップ割合（%）',s.live.skipPercent,'LBのうちスキップに使う割合。0〜100%。')}
     <label class="field"><span>通常ライブ</span><select name="play">${options('play',s.live.playId)}</select></label>
     <label class="field"><span>スキップ</span><select name="skip">${options('skip',s.live.skipId)}</select></label>
    </div>
    <details class="economy-help ui-details"><summary>直接EXP用のプレイ回数</summary><div class="economy-fields ui-fields">${field('plays','通常回数 / 日',s.live.playsPerDay)}${field('skips','スキップ回数 / 日',s.live.skipsPerDay)}</div><p>直接付与EXPは在庫への供給に含めません。</p></details>
   </fieldset>
   <details class="economy-group ui-group"><summary>スタジオ</summary>
    ${toggle('studio','練習供給を含む',s.studio.enabled)}
    <div class="economy-fields ui-fields">${master.bands.map(b=>field('band-'+b.id,b.name+' 練習Lv',s.studio.levels.find(x=>x.bandId===b.id)?.level)).join('')}${field('interval','受取間隔（分）',s.studio.claimEveryMinutes,'受取までに蓄積する時間。60分=1時間。')}${field('minutes','蓄積時間 / 日（分）',s.studio.minutesPerDay,'1日の練習時間。上限1440分=24時間。')}</div>
   </details>
   ${d?.fixedSources.length?`<fieldset class="economy-group ui-group"><legend>その他の継続供給</legend><p class="ui-help">受取率100%=供給源1回分の全段階報酬を全回収、0%=除外、50%=総報酬の半分という平均近似です。日次達成率・パスの段階到達率ではありません。標準イベントとは独立した条件です。Premium等は利用する供給源の受取率で指定し、未指定は0%です。</p><div class="economy-fields ui-fields">${d.fixedSources.map((f,i)=>`<div>${field('fixed-'+i,f.name+' 受取率（%）',s.fixedSources.find(x=>x.sourceId===f.id)?.claimPercent??0,'0〜100%の整数。1〜99%も指定できます。')}<details class="ui-details"><summary>計算前提</summary><p class="ui-help">1回分の報酬 ÷ ${f.intervalDays?esc(f.intervalDays.numerator)+'/'+esc(f.intervalDays.denominator)+'日':'未確認の間隔'} × 受取率</p><p class="ui-help">${esc(f.basis)}</p></details></div>`).join('')}</div></fieldset>`:''}
   <p class="ui-feedback" data-dirty role="status">${dirty?'未反映の入力あり':''}</p>
  </form>
  <details class="economy-json"><summary>条件JSON・初期化</summary><div class="economy-actions"><button class="secondary" data-import>条件JSONをImport</button><input hidden type="file" data-file accept=".json"><button class="secondary" data-export>条件JSONをExport</button><button class="secondary danger" data-reset>試算条件を初期化</button></div></details>
 </section>
 `;
 const form=host.querySelector<HTMLFormElement>('form')!;
 for(const el of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')){const v=draft[el.name];if(v===undefined)continue;if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=v===true;else el.value=String(v);}
 const read=()=>{const data=new FormData(form);const t=(n:string)=>String(data.get(n)??'');const n=(k:string,nullable=false)=>{if(!t(k)&&nullable)return null;if(!/^\d+$/.test(t(k)))throw Error('数値は非負整数で入力してください');return Number(t(k));};const next={...s,rank:n('rank',true),includeEvents:data.has('includeEvents'),live:{enabled:data.has('live'),lbPerDay:n('lb')!,skipPercent:n('skipPercent')!,playId:t('play')||null,skipId:t('skip')||null,playsPerDay:n('plays',true),skipsPerDay:n('skips',true)},studio:{enabled:data.has('studio'),levels:master.bands.flatMap(b=>t('band-'+b.id)?[{bandId:b.id,level:n('band-'+b.id)!}]:[]),claimEveryMinutes:n('interval')!,minutesPerDay:n('minutes')!},includeRankDaily:data.has('rankDaily'),fixedSources:d?.fixedSources.flatMap((f,i)=>n('fixed-'+i)?[{sourceId:f.id,claimPercent:n('fixed-'+i)!}]:[])??[]};return next;};
 const act=(fn:()=>void)=>{try{fn();}catch(e){message=String(e);}mount(host);changed();};
 const setStatus=(text:string)=>{host.querySelector('[data-economy-message]')!.textContent=text;host.querySelector('[data-dirty]')!.textContent=dirty?'未反映の入力あり':'';const state=host.querySelector('[data-result-state]');if(state)state.textContent=dirty?'変更前の確定条件による結果です。入力は未反映・未保存です。':'';changed();};
 const refresh=()=>{const area=host.querySelector<HTMLElement>('[data-economy-results]')!;const opened=new Map([...area.querySelectorAll('details')].map(el=>[el.querySelector('summary')?.textContent,el.open]));area.innerHTML=resultsMarkup();area.querySelectorAll('details').forEach(el=>{const open=opened.get(el.querySelector('summary')?.textContent);if(open!==undefined)el.open=open;});bindResultExport();};
 const commit=()=>{
  let invalid=false;
  for(const el of form.querySelectorAll<HTMLInputElement>('input[type=number]')){
   const nullable=el.name==='rank'||el.name==='plays'||el.name==='skips'||el.name.startsWith('band-');
   const ok=(el.value===''&&nullable&&!el.validity.badInput)||(el.value!==''&&/^\d+$/.test(el.value)&&el.validity.valid&&Number.isSafeInteger(Number(el.value)));
   el.setAttribute('aria-invalid',String(!ok));
   const id=el.id+'-error';let error=host.querySelector<HTMLElement>('#'+id);
   if(!error){error=document.createElement('small');error.id=id;error.className='ui-feedback';el.after(error);el.setAttribute('aria-describedby',[el.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));}
   error.textContent=ok?'':`整数を${el.min}〜${el.max}で入力してください（空欄は${nullable?'不明として扱います':'保存しません'}）。`;invalid ||= !ok;
  }
  if(invalid){setStatus('入力内容を確認してください。確定条件は変更していません。');return;}
  try{
   if(context().protected||training.damaged())throw Error('保存データ・育成条件を復旧してください');
   const next=read();const calculated=simulateEconomy(master,collection,training.current(),next);store.update(next,false,true);s=store.current();dirty=false;draft={};
   result=calculated;refresh();message='自動保存しました';setStatus(message);
  }catch(e){message=String(e);setStatus(message);}
 };
 const capture=()=>{draft=Object.fromEntries([...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')].map(el=>[el.name,el instanceof HTMLInputElement&&el.type==='checkbox'?el.checked:el.value]));dirty=true;commit();};
 form.oninput=e=>{if((e.target as HTMLInputElement).type==='number')capture();};form.onchange=capture;form.onsubmit=e=>{e.preventDefault();capture();};
 const bindJumps=()=>host.querySelectorAll<HTMLButtonElement>('[data-economy-jump]').forEach(button=>{button.onclick=()=>{const heading=host.querySelector<HTMLElement>('#'+button.dataset.economyJump);heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start'});};});
 const bindResultExport=()=>{bindJumps();host.querySelector<HTMLButtonElement>('[data-result-export]')?.addEventListener('click',()=>download(JSON.stringify(result,null,2),'supply-result.json'));};
 bindResultExport();
 if(dirty)setStatus('未反映の入力を保持しています。');

 host.querySelector<HTMLButtonElement>('[data-export]')!.onclick=()=>act(()=>download(exportEconomyScenario(read()),'supply-scenario.json'));

 host.querySelector<HTMLButtonElement>('[data-original]')?.addEventListener('click',()=>download(store.original()!,'original-scenario.json'));
 host.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{if(confirm('試算条件を初期化しますか？'))act(()=>{store.update(initial(),true,true);draft={};dirty=false;message='初期化しました';});};
 host.querySelector<HTMLButtonElement>('[data-import]')!.onclick=()=>host.querySelector<HTMLInputElement>('[data-file]')!.click();
 host.querySelector<HTMLInputElement>('[data-file]')!.onchange=async e=>{try{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>5*1024*1024)throw Error('ファイルが大きすぎます');const next=importEconomyScenario(await file.text());if(next.catalogId!==context().master.catalogId)throw Error('catalogIdが一致しません');store.update(next,true,true);draft={};dirty=false;message='Importしました';}catch(e){message=String(e);}if(host.isConnected)mount(host);};
 bindTrainingSettings(host.closest<HTMLElement>('#app')??host,training);changed();
 }
 return {mount,saveState:()=>({label:dirty?'未反映の試算条件あり':store.message()||'試算条件',unsaved:dirty||store.unsaved()||store.protected()})};
}
