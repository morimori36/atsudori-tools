import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { StoragePort } from '../storage/local';
import type { TrainingSettingsStore } from '../storage/training-settings';
import { createEconomyStore } from '../storage/economy';
import { emptyEconomyScenario,importEconomyScenario,exportEconomyScenario } from '../domain/economy/validate';
import { simulateEconomy } from '../app/economy-simulation';
import { trainingSettingsMarkup,bindTrainingSettings } from './training-settings';
import { resourcesForDisplay } from './resource-order';
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const num=(v:number|null)=>v===null?'未確認':v.toLocaleString('ja-JP',{maximumFractionDigits:3});
export function createEconomyView(storage:StoragePort|undefined,context:()=>{master:Masterdata;collection:Collection;protected:boolean},training:TrainingSettingsStore,download:(text:string,name:string)=>void,changed:()=>void){
 const initial=()=>{const s=emptyEconomyScenario(context().master.catalogId);s.rank=context().collection.tgwRank??null;return s;};
 const store=createEconomyStore(storage,initial());let message='',dirty=false;let draft:Record<string,string|boolean>={};
 const field=(name:string,label:string,value:unknown,type='number')=>`<label class="field">${esc(label)}<input name="${name}" type="${type}" inputmode="numeric" value="${esc(value??'')}" ${type==='number'?'min="0" step="1"':''}></label>`;
 function mount(host:HTMLElement):void{
 const {master,collection}=context();let s=store.current();if(store.fresh()&&!dirty&&s.catalogId!==master.catalogId)s=initial();
 const d=master.supplyDefinition;
 const options=(mode:string,id:string|null)=>`<option value="">未設定</option>${d?.lives.filter(r=>r.mode===mode).map(r=>`<option value="${esc(r.id)}" ${r.id===id?'selected':''}>${esc(r.name)}</option>`).join('')??''}`;
 let result:ReturnType<typeof simulateEconomy>|undefined;
 try{if(!context().protected&&!store.protected()&&!training.damaged())result=simulateEconomy(master,collection,training.current(),s);}catch(e){message=String(e);}
 const byResource=new Map(result?.rows.map(row=>[row.resource.id,row]));
 const table=(r:NonNullable<typeof result>)=>`<div class="economy-table-wrap"><table class="economy-table"><thead><tr>${['素材','必要量','現在庫','不足量','日平均供給','充足日数'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${resourcesForDisplay(r.rows.map(x=>x.resource)).map(resource=>byResource.get(resource.id)!).map(x=>`<tr data-economy-resource="${esc(x.resource.id)}"><th>${esc(x.resource.name)}</th><td>${x.required===null?'未確認（小計 '+num(x.requiredSubtotal)+'）':num(x.required)}</td><td>${x.stock===null?'未登録':num(x.stock)}</td><td>${num(x.shortage)}</td><td>${x.dailySupply===null?'未確認（小計 '+num(x.knownDailySupply)+'）':num(x.dailySupply)}</td><td>${x.status==='unreachable'?'現在の条件では充足不可':x.status==='unknown'?'算出不可':num(x.clearanceDays)+'日'}</td></tr>`).join('')}</tbody></table></div>`;
 const details=(r:NonNullable<typeof result>)=>`<details><summary>日平均供給の内訳・根拠</summary><ul>${r.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul><div class="economy-table-wrap"><table class="economy-table"><thead><tr><th>供給源</th><th>素材・権利</th><th>日平均</th><th>区分</th><th>受取先</th><th>根拠</th></tr></thead><tbody>${r.breakdown.map(e=>`<tr><td>${esc(e.sourceName)}</td><td>${esc(master.materialDefinition?.resources.find(x=>x.id===e.resourceId)?.name??e.resourceId)}</td><td>${num(e.dailyQuantity)}</td><td>${{confirmed:'確認済み報酬の平均',expected:'抽選期待値',estimated:'イベント推計'}[e.certainty]}</td><td>${{inventory:'在庫',direct:'直接付与（在庫対象外）',entitlement:'権利（素材換算なし）'}[e.destination]}</td><td>${esc(e.basis)}</td></tr>`).join('')}</tbody></table></div></details>`;
 const toggle=(name:string,label:string,checked:boolean)=>`<label class="economy-toggle"><input name="${name}" type="checkbox" ${checked?'checked':''}><span>${label}</span></label>`;
 host.innerHTML=trainingSettingsMarkup(training)+`
 <section class="panel economy-conditions" aria-labelledby="economy-conditions-heading">
  <h2 id="economy-conditions-heading">試算条件</h2>
  ${context().protected?'<p class="warning" role="alert">マスタ・所持データを保護中です。JSON Import / Exportで復旧してください。</p>':''}
  <p data-economy-message role="status">${esc(message||store.message())}</p>
  ${store.protected()?'<p class="warning">旧形式・破損条件の元JSONを保護しています。v5条件をImportまたは初期化してください。</p><button class="secondary" data-original>元JSONをExport</button>':''}
  <form id="economy-form">
   <fieldset class="economy-group"><legend>ランク・イベント</legend>
    <div class="economy-fields">${field('rank','T.G.Wランク',s.rank)}
     <div class="economy-options">${toggle('rankDaily','ランクのデイリー報酬を含む',s.includeRankDaily)}${toggle('includeEvents','標準イベントの全回収供給を含む',s.includeEvents)}
      <span class="economy-note">想定開催間隔：${d?.standardEvent?.intervalDays??'未登録'}日</span>
     </div>
    </div>
    <details class="economy-help"><summary>イベントの前提</summary><p>${esc(d?.standardEvent?.basis??'開催頻度・標準報酬は外部定義が必要です。')}</p></details>
   </fieldset>
   <fieldset class="economy-group"><legend>ライブ・スキップ</legend>
    ${toggle('live','供給を含む',s.live.enabled)}
    <div class="economy-fields">${field('lb','LB消費 / 日',s.live.lbPerDay)}${field('skipPercent','スキップ割合（%）',s.live.skipPercent)}
     <label class="field"><span>通常ライブ</span><select name="play">${options('play',s.live.playId)}</select></label>
     <label class="field"><span>スキップ</span><select name="skip">${options('skip',s.live.skipId)}</select></label>
    </div>
    <details class="economy-help"><summary>直接EXP用のプレイ回数</summary><div class="economy-fields">${field('plays','通常回数 / 日',s.live.playsPerDay)}${field('skips','スキップ回数 / 日',s.live.skipsPerDay)}</div><p>直接付与EXPは在庫への供給に含めません。</p></details>
   </fieldset>
   <details class="economy-group"><summary>スタジオ</summary>
    ${toggle('studio','練習供給を含む',s.studio.enabled)}
    <div class="economy-fields">${master.bands.map(b=>field('band-'+b.id,b.name+' 練習Lv',s.studio.levels.find(x=>x.bandId===b.id)?.level)).join('')}${field('interval','受取間隔（分）',s.studio.claimEveryMinutes)}${field('minutes','蓄積時間 / 日（分）',s.studio.minutesPerDay)}</div>
   </details>
   ${d?.fixedSources.length?`<fieldset class="economy-group"><legend>その他の継続供給</legend><div class="economy-fields">${d.fixedSources.map((f,i)=>field('fixed-'+i,f.name+' 受取率（%）',s.fixedSources.find(x=>x.sourceId===f.id)?.claimPercent??0)).join('')}</div></fieldset>`:''}
   <div class="economy-actions"><button class="primary">試算して条件を保存</button><span class="economy-note" data-dirty role="status">${dirty?'未反映の入力あり':''}</span></div>
  </form>
  <details class="economy-json"><summary>条件JSON・初期化</summary><div class="economy-actions"><button class="secondary" data-import>条件JSONをImport</button><input hidden type="file" data-file accept=".json"><button class="secondary" data-export>条件JSONをExport</button><button class="secondary danger" data-reset>試算条件を初期化</button></div></details>
 </section>
 ${result?`<section class="panel economy-results" aria-labelledby="economy-results-heading"><h2 id="economy-results-heading">素材別の充足日数</h2>
  <div class="economy-result-notes"><span>日平均の概算</span><span>抽選は期待値</span><span>イベントは推計</span></div>
  ${table(result)}
  ${result.issues.length||result.pendingRequirements.length?`<details class="economy-warnings" open><summary>未確認事項（${result.issues.length+result.pendingRequirements.length}）</summary><ul>${result.issues.map(i=>`<li>${esc(i.reason)}</li>`).join('')}${result.pendingRequirements.map(i=>`<li>${esc(i.kind)} #${i.cardId} / ${esc(i.axis)}: ${esc(i.reason)}</li>`).join('')}</ul></details>`:''}
  <details class="economy-help"><summary>試算の前提・結果の読み方</summary><p>日平均供給が続く場合の概算です。イベントは全回収報酬÷想定開催間隔の推計です。一度きり・課金・期間限定報酬は対象外です。在庫や必要量に未確認がある素材は充足日数を算出しません。</p></details>
  ${details(result)}<button class="secondary" data-result-export>結果・前提をExport</button>
 </section>`:''}`;
 const form=host.querySelector<HTMLFormElement>('form')!;
 for(const el of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')){const v=draft[el.name];if(v===undefined)continue;if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=v===true;else el.value=String(v);}
 const capture=()=>{draft=Object.fromEntries([...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')].map(el=>[el.name,el instanceof HTMLInputElement&&el.type==='checkbox'?el.checked:el.value]));dirty=true;host.querySelector('[data-dirty]')!.textContent='未反映の入力あり';changed();};form.oninput=capture;
 const read=()=>{const data=new FormData(form);const t=(n:string)=>String(data.get(n)??'');const n=(k:string,nullable=false)=>{if(!t(k)&&nullable)return null;if(!/^\d+$/.test(t(k)))throw Error('数値は非負整数で入力してください');return Number(t(k));};const next={...s,rank:n('rank',true),includeEvents:data.has('includeEvents'),live:{enabled:data.has('live'),lbPerDay:n('lb')!,skipPercent:n('skipPercent')!,playId:t('play')||null,skipId:t('skip')||null,playsPerDay:n('plays',true),skipsPerDay:n('skips',true)},studio:{enabled:data.has('studio'),levels:master.bands.flatMap(b=>t('band-'+b.id)?[{bandId:b.id,level:n('band-'+b.id)!}]:[]),claimEveryMinutes:n('interval')!,minutesPerDay:n('minutes')!},includeRankDaily:data.has('rankDaily'),fixedSources:d?.fixedSources.flatMap((f,i)=>n('fixed-'+i)?[{sourceId:f.id,claimPercent:n('fixed-'+i)!}]:[])??[]};return next;};
 const act=(fn:()=>void)=>{try{fn();}catch(e){message=String(e);}mount(host);changed();};
 form.onsubmit=e=>{e.preventDefault();act(()=>{if(context().protected||training.damaged())throw Error('保存データ・育成条件を復旧してください');const next=read();simulateEconomy(master,collection,training.current(),next);const ok=store.update(next);dirty=false;draft={};message=ok?'保存・試算しました':store.message();});};
 host.querySelector<HTMLButtonElement>('[data-export]')!.onclick=()=>act(()=>download(exportEconomyScenario(read()),'supply-scenario.json'));
 host.querySelector<HTMLButtonElement>('[data-result-export]')?.addEventListener('click',()=>download(JSON.stringify(result,null,2),'supply-result.json'));
 host.querySelector<HTMLButtonElement>('[data-original]')?.addEventListener('click',()=>download(store.original()!,'original-scenario.json'));
 host.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{if(confirm('試算条件を初期化しますか？'))act(()=>{store.update(initial(),true,true);draft={};dirty=false;message='初期化しました';});};
 host.querySelector<HTMLButtonElement>('[data-import]')!.onclick=()=>host.querySelector<HTMLInputElement>('[data-file]')!.click();
 host.querySelector<HTMLInputElement>('[data-file]')!.onchange=async e=>{try{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>5*1024*1024)throw Error('ファイルが大きすぎます');const next=importEconomyScenario(await file.text());if(next.catalogId!==context().master.catalogId)throw Error('catalogIdが一致しません');store.update(next,true,true);draft={};dirty=false;message='Importしました';}catch(e){message=String(e);}if(host.isConnected)mount(host);};
 bindTrainingSettings(host.closest<HTMLElement>('#app')??host,training);changed();
 }
 return {mount,saveState:()=>({label:dirty?'未反映の試算条件あり':store.message()||'試算条件',unsaved:dirty||store.unsaved()||store.protected()})};
}
