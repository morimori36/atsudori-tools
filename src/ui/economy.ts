import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { StoragePort } from '../storage/local';
import type { TrainingSettingsStore } from '../storage/training-settings';
import { createEconomyStore } from '../storage/economy';
import { emptyEconomyScenario, exportEconomyScenario, importEconomyScenario, validateEconomyScenario } from '../domain/economy/validate';
import type { EconomyScenario } from '../domain/economy/model';
import { DAY, dateValue, localDate } from '../domain/economy/time';
import { simulateEconomy } from '../app/economy-simulation';
import type { EconomyResult } from '../domain/economy/calculate';
import { bindTrainingSettings, trainingSettingsMarkup } from './training-settings';

const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(n:number|null)=>n===null?'未確認':n.toLocaleString('ja-JP',{maximumFractionDigits:3});
const datePlus=(date:string,days:number)=>new Date(dateValue(date)+days*DAY).toISOString().slice(0,10);
const input=(name:string,label:string,value:unknown,type='number',min=0,max?:number)=>`<label class="field"><span>${escape(label)}</span><input name="${name}" type="${type}" value="${escape(value??'')}" ${type==='number'?`min="${min}" step="1" ${max!==undefined?`max="${max}"`:''}`:''}></label>`;
const check=(name:string,label:string,value:boolean)=>`<label class="check"><input type="checkbox" name="${name}" ${value?'checked':''}>${escape(label)}</label>`;

export function createEconomyView(storage:StoragePort|undefined,context:()=>{master:Masterdata;collection:Collection;protected:boolean},
  training:TrainingSettingsStore,download:(text:string,name:string)=>void,changed:()=>void) {
  const initial=()=>{const {master,collection}=context();const s=emptyEconomyScenario(master.catalogId,new Date().toLocaleDateString('sv-SE'));
    s.rank=collection.tgwRank??null;return s;};
  const store=createEconomyStore(storage,initial());
  let scenario=store.current(),dirty=false,message='',error=false;
  let pristine=store.fresh();
  let draft:Map<string,string|boolean>|null=null;
  let comparison='';
  let comparisonContext:{master:Masterdata;collection:Collection;training:string}|undefined;
  let host:HTMLElement|undefined;
  let readId=0;
  const expanded=new Map<string,boolean>();
  const fail=(e:unknown)=>{message=e instanceof Error?e.message:String(e);error=true;};
  function resourceOptions(selected:string):string {
    return '<option value="">選択してください</option>'+(context().master.materialDefinition?.resources.map(r=>`<option value="${escape(r.id)}" ${r.id===selected?'selected':''}>${escape(r.name)}</option>`).join('')??'');
  }
  function select(name:string,label:string,selected:string|null,rows:{id:string;name:string}[]):string {
    return `<label class="field"><span>${escape(label)}</span><select name="${name}"><option value="">未設定</option>${selected&&!rows.some(r=>r.id===selected)?`<option selected value="${escape(selected)}">定義なし: ${escape(selected)}</option>`:''}${rows.map(r=>`<option value="${escape(r.id)}" ${r.id===selected?'selected':''}>${escape(r.name)}</option>`).join('')}</select></label>`;
  }
  function passDates(s:EconomyScenario,id:string,startsOn:string,count:number):string[] {
    const pass=context().master.supplyDefinition?.passes.find(p=>p.id===id);
    if(!pass)return [];
    const from=[startsOn,s.startDate].sort().at(-1)!,to=[datePlus(startsOn,pass.durationDays-1),s.endDate].sort()[0]!;
    const available=Math.max(0,(dateValue(to)-dateValue(from))/DAY+1);
    if(count>available)throw new Error('パス受取日数が契約期間・試算期間を超えます');
    if(s.pass?.passId===id&&s.pass.startsOn===startsOn&&s.pass.claimDates.length===count&&s.pass.claimDates.every(d=>d>=from&&d<=to))return s.pass.claimDates;
    return Array.from({length:count},(_,i)=>datePlus(from,i));
  }
  function formValue(validate=true):EconomyScenario {
    const form=host!.querySelector<HTMLFormElement>('#economy-form')!,data=new FormData(form);
    const text=(name:string)=>String(data.get(name)??'');
    const n=(name:string,nullable=false):number|null=>{
      const v=text(name);if(!v&&nullable)return null;
      if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw new Error('数値は0以上の安全な整数で入力してください');return Number(v);
    };
    const integer=(name:string)=>n(name)!;
    const yes=(name:string)=>data.has(name);
    const {master}=context(),d=master.supplyDefinition;
    const s:EconomyScenario={...scenario,startDate:text('startDate'),endDate:text('endDate'),rank:n('rank',true),
      live:{enabled:yes('live-enabled'),lbPerDay:integer('lb'),skipPercent:integer('skipPercent'),playId:text('play')||null,skipId:text('skip')||null,
        playsPerDay:n('playsPerDay',true),skipsPerDay:n('skipsPerDay',true)},
      studio:{enabled:yes('studio-enabled'),claimEveryMinutes:integer('claimEveryMinutes'),minutesPerDay:integer('minutesPerDay'),
        levels:master.bands.flatMap(b=>text('band-'+b.id)?[{bandId:b.id,level:integer('band-'+b.id)}]:[])},
      dailyClaims:integer('dailyClaims'),
      events:d?.events.flatMap((e,i)=>yes('event-'+i)?[{eventId:e.id,claimDate:text('event-date-'+i),points:n('event-points-'+i,true),fullCollection:yes('event-full-'+i),buyLimited:yes('event-buy-'+i)}]:[])??[],
      purchases:d?.offers.flatMap((o,i)=>integer('offer-'+i)>0||integer('offer-used-'+i)>0?[{offerId:o.id,quantity:integer('offer-'+i),alreadyPurchased:integer('offer-used-'+i)}]:[])??[],
      fixedSources:d?.fixedSources.flatMap((f,i)=>integer('fixed-'+i)?[{sourceId:f.id,claims:integer('fixed-'+i)}]:[])??[],pass:null};
    for(const [key,prefix] of [['externalIncome','income'],['allocations','spend']] as const){
      const rows=scenario[key];
      const values=rows.map((row,i)=>{
        const amounts=('amounts' in row?row.amounts:row.costs).map((_,j)=>({resourceId:text(prefix+'-resource-'+i+'-'+j),quantity:integer(prefix+'-quantity-'+i+'-'+j)}));
        const base={id:row.id,name:text(prefix+'-name-'+i),date:text(prefix+'-date-'+i)};
        return prefix==='income'?{...base,amounts}:{...base,purpose:text(prefix+'-purpose-'+i) as EconomyScenario['allocations'][number]['purpose'],costs:amounts};
      });
      if(key==='externalIncome')s.externalIncome=values as EconomyScenario['externalIncome'];else s.allocations=values as EconomyScenario['allocations'];
    }
    const id=text('pass');
    s.events.push(...scenario.events.filter(e=>!d?.events.some(r=>r.id===e.eventId)));
    s.purchases.push(...scenario.purchases.filter(p=>!d?.offers.some(r=>r.id===p.offerId)));
    s.fixedSources.push(...scenario.fixedSources.filter(f=>!d?.fixedSources.some(r=>r.id===f.sourceId)));
    s.studio.levels.push(...scenario.studio.levels.filter(l=>!master.bands.some(b=>b.id===l.bandId)));
    if(id){const startsOn=text('pass-start');s.pass={passId:id,startsOn,claimDates:passDates(s,id,startsOn,integer('pass-claims'))};}
    return validate?validateEconomyScenario(s):s;
  }
  function flows(prefix:'income'|'spend'):string {
    const rows=prefix==='income'?scenario.externalIncome:scenario.allocations;
    return rows.map((r,i)=>`<div class="economy-flow"><div class="form-grid">${input(prefix+'-name-'+i,'用途・収入名',r.name,'text')}${input(prefix+'-date-'+i,'計上日',r.date,'date')}
      ${prefix==='spend'?select(prefix+'-purpose-'+i,'用途','purpose' in r?r.purpose:'other',[{id:'gacha',name:'ガチャ'},{id:'lb',name:'LB回復'},{id:'reserve',name:'将来用に確保'},{id:'other',name:'その他'}]):''}</div>
      ${('amounts' in r?r.amounts:r.costs).map((a,j)=>`<div class="economy-amount"><label class="field"><span>資源</span><select name="${prefix}-resource-${i}-${j}">${resourceOptions(a.resourceId)}</select></label>${input(prefix+'-quantity-'+i+'-'+j,'数量',a.quantity)}</div>`).join('')}
      <button type="button" class="secondary small" data-economy-add-amount="${prefix}:${i}">資源を追加</button> <button type="button" class="secondary small" data-economy-remove="${prefix}:${i}">この入出金を削除</button></div>`).join('');
  }
  function resultMarkup(result:EconomyResult):string {
    const table=(currency:boolean)=>{
      const rows=result.rows.filter(r=>r.currency===currency&&(currency||r.required||r.stock!==null||r.sources.length||r.supplyIncomplete));
      const mobile=rows.map(r=>`<article class="economy-resource-card" data-economy-mobile-resource="${escape(r.resource.id)}"><h4>${escape(r.resource.name)}</h4><p>試算後の不足 <strong>${number(r.estimatedShortage)}</strong>（期待含む）</p><dl>${[
        ['必要数',number(r.required)+(r.demandIncomplete?' ※':'')],['現在庫',r.stock===null?'未登録':number(r.stock)],
        ['確定収入',number(r.confirmedIncome)+(r.supplyIncomplete?' ※':'')],['条件付き収入',number(r.conditionalIncome)+(r.supplyIncomplete?' ※':'')],
        ['期待収入',number(r.expectedIncome)+(r.supplyIncomplete?' ※':'')],['支出 / 確保',number(r.spent)+' / '+number(r.reserved)],
        ['計算済み残高',number(r.fixedStock)],['推定在庫',number(r.estimatedStock)]
      ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><small>主な供給源: ${escape(r.sources.join(' / ')||'—')}</small></article>`).join('');
      return rows.length?`<p class="economy-table-hint muted">表を横にスクロールして、すべての収支を確認できます。</p><div class="economy-table-wrap economy-summary-table" role="region" aria-label="収支の表（横にスクロールできます）" tabindex="0"><table class="economy-table"><thead><tr><th scope="col">資源</th><th scope="col">必要数</th><th scope="col">現在庫</th><th scope="col">確定収入</th><th scope="col">条件付き収入</th><th scope="col">期待収入</th><th scope="col">支出 / 確保</th><th scope="col">計算済み残高</th><th scope="col">推定在庫（期待含む）</th><th scope="col">試算後の不足</th><th scope="col">主な供給源</th></tr></thead><tbody>${rows.map(r=>`<tr data-economy-resource="${escape(r.resource.id)}"><th scope="row">${escape(r.resource.name)}<small>${escape(r.resource.unit==='exp'?'EXP':r.resource.unit==='card'?'枚':'個')}</small></th><td>${number(r.required)}${r.demandIncomplete?' ※':''}</td><td>${r.stock===null?'未登録':number(r.stock)}</td><td>${number(r.confirmedIncome)}${r.supplyIncomplete?' ※':''}</td><td>${number(r.conditionalIncome)}</td><td>${number(r.expectedIncome)}${r.supplyIncomplete?' ※':''}</td><td>${number(r.spent)} / ${number(r.reserved)}</td><td>${number(r.fixedStock)}</td><td>${number(r.estimatedStock)}</td><td>${number(r.estimatedShortage)}${r.estimatedShortage!==null?'（期待含む）':''}</td><td>${escape(r.sources.join(' / ')||'—')}</td></tr>`).join('')}</tbody></table></div><div class="economy-mobile-balances">${mobile}</div>`:'<p class="muted">対象の資源がありません。</p>';
    };
    const rights=[...result.entitlements,...result.directRewards];
    const grouped=new Map<string,{name:string;quantity:number;kind:string}>();
    for(const r of rights){const key=[r.sourceId,r.resourceId,r.destination,r.certainty].join(':');const before=grouped.get(key);grouped.set(key,{name:r.sourceName+' / '+(context().master.materialDefinition?.resources.find(m=>m.id===r.resourceId)?.name??r.resourceId),quantity:(before?.quantity??0)+r.quantity,kind:(r.destination==='direct'?'直接付与':'利用権')+' / '+(r.certainty==='expected'?'期待値':r.certainty==='conditional'?'条件付き':'確定')});}
    return `<section class="panel economy-results" aria-label="試算結果"><div class="panel-heading"><h2>${result.period.days}日間の試算</h2><button type="button" class="secondary" data-economy-result-export>結果・前提をExport</button></div>
      <p>購入費用 ${number(result.cashCostYen)}円。計算済み残高は選択した条件付き収入・支出を含み、抽選の期待値は含みません。不足は期待値も含めた試算です。</p>
      <p class="muted">※ 定義不足がある収入は計算済み小計です。全体の不足は未確認になります。在庫未登録も未確認です。所持データは変更しません。</p>
      <h3>素材収支</h3>${table(false)}<h3>スター・通貨収支</h3>${table(true)}
      <details data-economy-detail="rights"><summary>無料抽選の権利・直接付与EXP（在庫とは別）</summary>${grouped.size?`<ul>${[...grouped.values()].map(r=>`<li>${escape(r.name)}: ${number(r.quantity)}（${r.kind}）</li>`).join('')}</ul>`:'<p>計上された権利・直接報酬はありません。</p>'}</details>
      <details data-economy-detail="issues" ${result.issues.length?'open':''}><summary>未確認・未実行（${result.issues.length}件）</summary>${result.issues.length?`<ul>${result.issues.map(r=>`<li>${escape(r.sourceId)}: ${escape(r.reason)}</li>`).join('')}</ul>`:'<p>登録された対象内に未確認項目はありません。</p>'}</details>
      <details data-economy-detail="assumptions"><summary>入力・定義の版・計算前提</summary><p>catalog: ${escape(result.catalog.catalogId)} / ${escape(result.catalog.revision)}、供給定義: ${escape(result.catalog.supplyRevision??'未登録')}、日付のUTC差: ${result.period.utcOffsetMinutes??'未確認'}分</p><ul>${result.assumptions.map(a=>`<li>${escape(a)}</li>`).join('')}</ul><p>${escape(context().master.supplyDefinition?.basis??'供給根拠は未登録です')}</p><pre>${escape(exportEconomyScenario(result.scenario))}</pre></details>
      <details data-economy-detail="ledger"><summary>取得元・支出の明細（${result.ledger.length}件）</summary><div class="economy-table-wrap"><table class="economy-table"><thead><tr><th>日時</th><th>取得元・用途</th><th>資源</th><th>区分</th><th>数量</th><th>根拠</th></tr></thead><tbody>${result.ledger.slice(0,500).map(r=>`<tr><td>${escape(r.at)}</td><td>${escape(r.sourceName)}</td><td>${escape(context().master.materialDefinition?.resources.find(m=>m.id===r.resourceId)?.name??r.resourceId)}</td><td>${r.certainty==='expected'?'期待値':r.certainty==='conditional'?'条件付き':'確定'}${r.conditional&&r.certainty==='expected'?'・条件付き':''} / ${r.destination==='inventory'?'在庫':r.destination==='direct'?'直接付与':r.destination==='reservation'?'確保':'利用権'}</td><td>${number(r.quantity)}</td><td>${escape(r.basis)}</td></tr>`).join('')}</tbody></table></div>${result.ledger.length>500?'<p>画面は先頭500件です。Exportには全件含まれます。</p>':''}</details></section>`;
  }
  function mount(next:HTMLElement):void {
    host=next;
    const {master,collection,protected:protectedData}=context(),d=master.supplyDefinition;
    if(comparisonContext&&(comparisonContext.master!==master||comparisonContext.collection!==collection||comparisonContext.training!==JSON.stringify(training.current())))comparison='';
    if(pristine&&!dirty&&scenario.catalogId!==master.catalogId)scenario=initial();
    const s=scenario;
    let result:ReturnType<typeof simulateEconomy>|undefined;
    if(!protectedData&&!store.protected()&&!training.damaged())try{result=simulateEconomy(master,collection,training.current(),pristine?s:store.current());}catch(e){fail(e);}
    next.innerHTML=`${trainingSettingsMarkup(training)}<section class="panel economy-inputs"><div class="panel-heading"><h2>試算条件</h2><div><button type="button" class="secondary" data-economy-import>条件JSONをImport</button><input type="file" hidden data-economy-file accept=".json,application/json"><button type="button" class="secondary" data-economy-export>条件JSONをExport</button></div></div>
      ${!d?'<p class="alert">供給定義が未登録です。supplyDefinitionを含むcatalogをJSON Import / Exportから登録してください。</p>':''}
      ${protectedData?'<p role="alert">所持・マスタの保存データを保護中です。JSON Import / Exportで復旧してください。</p>':''}
      ${store.message()?`<p role="alert">${escape(store.message())}</p>`:''}
      ${store.protected()?'<button type="button" class="secondary" data-economy-original>元の試算条件をExport</button>':''}
      <p data-economy-message role="${error?'alert':'status'}">${escape(message)}</p>
      <form id="economy-form"><div class="form-grid">${input('startDate','開始日',s.startDate,'date')}${input('endDate','終了日（含む）',s.endDate,'date')}${input('rank','T.G.W CARDランク',s.rank,'number',1)}</div>
      <div class="economy-presets">期間 <button type="button" class="secondary small" data-economy-days="1">1日</button> <button type="button" class="secondary small" data-economy-days="7">7日</button> <button type="button" class="secondary small" data-economy-days="30">30日</button></div>
      <details data-economy-detail="live"><summary>通常ライブ・LB消化</summary>${check('live-enabled','ライブを試算する',s.live.enabled)}<div class="form-grid">${input('lb','1日あたりのLB消費',s.live.lbPerDay)}${input('skipPercent','スキップの割合（%）',s.live.skipPercent,'number',0,100)}${select('play','通常プレイのスコアランク',s.live.playId,d?.lives.filter(r=>r.mode==='play')??[])}${select('skip','スキップのスコアランク',s.live.skipId,d?.lives.filter(r=>r.mode==='skip')??[])}${input('playsPerDay','通常プレイ回数 / 日（直接報酬用・任意）',s.live.playsPerDay)}${input('skipsPerDay','スキップ回数 / 日（直接報酬用・任意）',s.live.skipsPerDay)}</div></details>
      <details data-economy-detail="studio"><summary>スタジオ練習</summary>${check('studio-enabled','スタジオ練習を試算する',s.studio.enabled)}<div class="form-grid">${master.bands.map(b=>input('band-'+b.id,b.name+' 練習Lv',s.studio.levels.find(l=>l.bandId===b.id)?.level??null,'number',1)).join('')}${input('claimEveryMinutes','受取間隔（蓄積時間・分）',s.studio.claimEveryMinutes,'number',1)}${input('minutesPerDay','1日あたりの蓄積時間（分）',s.studio.minutesPerDay,'number',0,1440)}</div><p class="muted">練習Lv・ランクは期間中固定します。蓄積時間を指定し、定義された効率低下・上限・端数処理を適用します。</p></details>
      <details data-economy-detail="daily"><summary>ランクのデイリー・その他の固定報酬</summary><div class="form-grid">${input('dailyClaims','T.G.W CARDの受取日数',s.dailyClaims)}${d?.fixedSources.map((f,i)=>input('fixed-'+i,`${f.name}（${f.category==='paid'?'有料':f.category==='oneTime'?'一度きり':'恒常'}）受取回数`,s.fixedSources.find(x=>x.sourceId===f.id)?.claims??0)).join('')??''}</div></details>
      <details data-economy-detail="events"><summary>イベント累計・繰り返し・交換所</summary>${d?.events.map((e,i)=>{const v=s.events.find(v=>v.eventId===e.id);const claim=[s.endDate,localDate(Date.parse(e.endsAt)-1,d.utcOffsetMinutes)].sort()[0]!;return `<fieldset><legend>${escape(e.name)}</legend><p>${escape(e.startsAt)} 〜 ${escape(e.endsAt)}</p>${check('event-'+i,'このイベントを回収する',!!v)}${check('event-full-'+i,'最終指定通貨を除き累計報酬を全回収',v?.fullCollection??true)}${check('event-buy-'+i,'回数制限商品をすべて交換する',v?.buyLimited??true)}<div class="form-grid">${input('event-date-'+i,'回収日',v?.claimDate??claim,'date')}${input('event-points-'+i,'到達イベントpt（未入力の繰り返し分は未確認）',v?.points??null)}</div></fieldset>`;}).join('')||'<p>イベント定義は未登録です。</p>'}</details>
      <details data-economy-detail="offers"><summary>カタログ・星のシール・その他の交換方針</summary><p class="muted">数量0は購入しません。選択数量を各リセット期間で購入します。購入済み数は最初の期間に適用します。残高不足ではその購入を保留します。</p>${d?.offers.map((o,i)=>{const p=s.purchases.find(p=>p.offerId===o.id);return `<fieldset><legend>${escape(o.name)}</legend><p>${o.costs.map(c=>`${escape(master.materialDefinition?.resources.find(r=>r.id===c.resourceId)?.name??c.resourceId)} × ${number(c.quantity)}`).join(' + ')} / 上限 ${o.limit??'無制限'} / ${escape(o.reset.kind)}${o.minimumRank!==null?' / 必要ランク '+o.minimumRank:''}</p><div class="form-grid">${input('offer-'+i,'1期間の購入数量',p?.quantity??0)}${input('offer-used-'+i,'期間開始時の購入済み数',p?.alreadyPurchased??0)}</div></fieldset>`;}).join('')||'<p>商品定義は未登録です。価格や解放条件は補完しません。</p>'}</details>
      <details data-economy-detail="pass"><summary>アワーノーツパス</summary><div class="form-grid">${select('pass','契約を選択',s.pass?.passId??null,d?.passes.map(p=>({id:p.id,name:`${p.name} / ${p.priceYen}円 / ${p.durationDays}日`} ))??[])}${input('pass-start','契約開始日',s.pass?.startsOn??s.startDate,'date')}${input('pass-claims','期間内の受取日数',s.pass?.claimDates.length??0)}</div><p class="muted">受取日は契約・試算期間内の早い日から数えます。Importした受取日は日数を変えるまで保持します。無料ガチャは利用権として表示します。</p>${d?.passes.map(p=>`<p>${escape(p.name)}: ${p.features.map(escape).join(' / ')}</p>`).join('')??''}<button type="button" class="secondary" data-economy-compare>パスなし・各契約を比較</button></details>
      <details data-economy-detail="flows"><summary>スターなどの外部収入・用途配分</summary><p>星のシールなどの外部収入を入力できます。ガチャ・LB回復・将来のための確保は、同じ残高から支出します。</p><h3>外部収入</h3>${flows('income')}<button type="button" class="secondary" data-economy-add="income">外部収入を追加</button><h3>用途配分</h3>${flows('spend')}<button type="button" class="secondary" data-economy-add="spend">用途配分を追加</button></details>
      <div class="economy-submit"><button class="primary" type="submit">試算して条件を保存</button><span data-economy-dirty>${dirty?'未反映の入力があります':''}</span></div></form>
      <details><summary>試算条件の初期化</summary><button type="button" class="secondary danger" data-economy-reset>試算条件を初期化</button></details></section>${comparison}${result?resultMarkup(result):'<p>試算結果は保留中です。入力・保存状態を確認してください。</p>'}`;
    next.querySelectorAll<HTMLDetailsElement>('[data-economy-detail]').forEach(el=>{const key=el.dataset.economyDetail!;if(expanded.has(key))el.open=expanded.get(key)!;el.addEventListener('toggle',()=>expanded.set(key,el.open));});
    const form=next.querySelector<HTMLFormElement>('#economy-form')!;
    if(draft)for(const el of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input, select')){const v=draft.get(el.name);if(v===undefined)continue;if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=v===true;else el.value=String(v);}
    function capture():void {
      draft=new Map([...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input, select')].map(el=>[el.name,el instanceof HTMLInputElement&&el.type==='checkbox'?el.checked:el.value]));
      dirty=true;next.querySelector('[data-economy-dirty]')!.textContent='未反映の入力があります';changed();
    }
    const redraw=()=>mount(next);
    const action=(fn:()=>void)=>{try{fn();}catch(e){fail(e);}redraw();changed();};
    form.addEventListener('input',capture);form.addEventListener('change',capture);
    form.addEventListener('submit',event=>{event.preventDefault();action(()=>{const candidate=formValue();simulateEconomy(master,collection,training.current(),candidate);const saved=store.update(candidate);scenario=candidate;draft=null;dirty=false;pristine=false;message=saved?'条件を保存し、試算を更新しました':store.message();error=!saved;comparison='';});});
    next.querySelectorAll<HTMLButtonElement>('[data-economy-days]').forEach(b=>b.addEventListener('click',()=>{try{const start=String(new FormData(form).get('startDate'));form.querySelector<HTMLInputElement>('[name="endDate"]')!.value=datePlus(start,Number(b.dataset.economyDays)-1);capture();}catch(e){fail(e);redraw();}}));
    next.querySelector('[data-economy-export]')?.addEventListener('click',()=>action(()=>download(exportEconomyScenario(formValue()),'economy-scenario.json')));
    next.querySelector('[data-economy-result-export]')?.addEventListener('click',()=>{if(result)download(JSON.stringify(result,null,2)+'\n','economy-result.json');});
    next.querySelector('[data-economy-original]')?.addEventListener('click',()=>{const raw=store.original();if(raw!==null)download(raw,'economy-original.json');});
    next.querySelector('[data-economy-import]')?.addEventListener('click',()=>next.querySelector<HTMLInputElement>('[data-economy-file]')!.click());
    next.querySelector<HTMLInputElement>('[data-economy-file]')?.addEventListener('change',async event=>{
      const input=event.target as HTMLInputElement,file=input.files?.[0],id=++readId;if(!file)return;
      try{if(file.size>5*1024*1024)throw new Error('条件JSONは5MiB以内にしてください');const text=await file.text();if(id!==readId)return;
        const candidate=importEconomyScenario(text);if(candidate.catalogId!==context().master.catalogId)throw new Error('catalogIdが現在のマスタと一致しません');
        store.update(candidate,true,true);scenario=candidate;draft=null;dirty=false;pristine=false;message='試算条件をImportしました';error=false;comparison='';
      }catch(e){fail(e);}if(id===readId){if(host?.isConnected)mount(host);changed();}
    });
    next.querySelector('[data-economy-reset]')?.addEventListener('click',()=>{if(!confirm('試算条件を初期化します。所持・マスタ・育成条件は保持します。続けますか？'))return;action(()=>{readId++;const value=initial();store.update(value,true,true);scenario=value;draft=null;dirty=false;pristine=false;message='試算条件を初期化しました';error=false;comparison='';});});
    const edit=(change:()=>void)=>action(()=>{scenario=formValue(false);change();draft=null;dirty=true;comparison='';});
    next.querySelectorAll<HTMLButtonElement>('[data-economy-add]').forEach(b=>b.addEventListener('click',()=>edit(()=>{
      const base={id:crypto.randomUUID(),name:b.dataset.economyAdd==='income'?'外部収入':'用途配分',date:scenario.startDate};
      const amounts=[{resourceId:master.materialDefinition?.resources[0]?.id??'',quantity:0}];
      if(b.dataset.economyAdd==='income')scenario.externalIncome.push({...base,amounts});else scenario.allocations.push({...base,purpose:'reserve',costs:amounts});
    })));
    next.querySelectorAll<HTMLButtonElement>('[data-economy-remove]').forEach(b=>b.addEventListener('click',()=>edit(()=>{const [prefix,index]=b.dataset.economyRemove!.split(':');(prefix==='income'?scenario.externalIncome:scenario.allocations).splice(Number(index),1);})));
    next.querySelectorAll<HTMLButtonElement>('[data-economy-add-amount]').forEach(b=>b.addEventListener('click',()=>edit(()=>{const [prefix,index]=b.dataset.economyAddAmount!.split(':');const rows=prefix==='income'?scenario.externalIncome[Number(index)]!.amounts:scenario.allocations[Number(index)]!.costs;rows.push({resourceId:master.materialDefinition?.resources.find(r=>!rows.some(a=>a.resourceId===r.id))?.id??'',quantity:0});})));
    next.querySelector('[data-economy-compare]')?.addEventListener('click',()=>action(()=>{
      const base=formValue();const candidates=[null,...d?.passes??[]];
      comparisonContext={master,collection,training:JSON.stringify(training.current())};
      const comparisons=candidates.map(p=>{const test={...base,pass:p?{passId:p.id,startsOn:base.startDate,claimDates:[] as string[]}:null};if(p){const count=Math.min(p.durationDays,(dateValue(base.endDate)-dateValue(base.startDate))/DAY+1);test.pass!.claimDates=passDates(test,p.id,base.startDate,count);}return {name:p?.name??'パスなし',result:simulateEconomy(master,collection,training.current(),test)};});
      const currencies=d?.currencies??[];
      comparison=`<section class="panel"><h2>同じ条件でのパス比較</h2><p>比較では期間内の契約日をすべて受け取る前提です。各契約は1回だけ購入します。</p><div class="economy-table-wrap"><table class="economy-table"><thead><tr><th>契約</th><th>費用</th>${currencies.map(id=>`<th>${escape(master.materialDefinition?.resources.find(r=>r.id===id)?.name??id)} 計算済み残高</th>`).join('')}<th>未確認・未実行</th></tr></thead><tbody>${comparisons.map(c=>`<tr><th>${escape(c.name)}</th><td>${number(c.result.cashCostYen)}円</td>${currencies.map(id=>`<td>${number(c.result.rows.find(r=>r.resource.id===id)?.fixedStock??null)}</td>`).join('')}<td>${c.result.issues.length}件</td></tr>`).join('')}</tbody></table></div></section>`;
      message='パスごとの試算を比較しました';error=false;
    }));
    bindTrainingSettings(next.closest<HTMLElement>('#app')??next,training);
    changed();
  }
  return {mount,saveState:()=>({label:store.protected()?'試算条件を保護中':dirty?'未反映の試算条件あり':store.unsaved()?'試算条件が未保存':'試算条件を保存済み',unsaved:dirty||store.unsaved()||store.protected()})};
}
