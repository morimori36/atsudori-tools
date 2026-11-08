import { cardIdentity } from './card-identity';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { simulateTrainingEvaluation } from '../app/training-simulation';
import type { TrainingSettings } from '../app/hypothetical-training';
import type { TrainingSettingsStore } from '../storage/training-settings';
import { trainingSettingsMarkup } from './training-settings';
import type { CardRequirement } from '../domain/materials/calculate';
import type { MaterialAxis } from '../domain/materials/model';
import { materialInventoryBalances } from '../domain/materials/inventory';
const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(v:number|null|undefined):string=>v==null?'保留':v.toLocaleString('ja-JP');
const labels:Record<MaterialAxis,string>={trainingStage:'特訓',awakeningStage:'覚醒',liveSkillLevel:'ライブスキル',gekisouSkillLevel:'撃奏スキル',level:'レベル',rank:'上限解放'};
type Simulation=ReturnType<typeof simulateTrainingEvaluation>;

export function createMaterialsPage(master:Masterdata,collection:Collection,settings:TrainingSettingsStore) {
  const result=simulateTrainingEvaluation(master,collection,settings.current());
  return { html:trainingSettingsMarkup(settings)+materialsPage(master,collection,result) };
}

/** Reverse-index existing axis results; no cost calculation occurs here. */
export function materialConsumers(materials:Simulation['materials']) {
  const consumers=new Map<string,{card:CardRequirement;axis:CardRequirement['axes'][number];quantity:number}[]>();
  for(const card of materials.cards) for(const axis of card.axes) for(const amount of axis.amounts) {
    if(!consumers.has(amount.resourceId)) consumers.set(amount.resourceId,[]);
    consumers.get(amount.resourceId)!.push({card,axis,quantity:amount.quantity});
  }
  return consumers;
}

function materialsPage(master:Masterdata,collection:Collection,result:Simulation):string {
  const cardName=(card:CardRequirement)=>cardIdentity(card.kind==='member'?master.members.find(m=>m.id===card.cardId)!:master.snaps.find(s=>s.id===card.cardId)!);
  const stage=(axis:CardRequirement['axes'][number])=>`${labels[axis.axis]}${number(axis.current)}→${number(axis.target)}`;
  const sections=(['member','snap'] as const).map(kind=>{
    const {cards,consumption,byId}=materialSection(result.materials,collection,kind);
    const unavailable=cards.flatMap(card=>card.axes.filter(a=>a.status==='unavailable').map(axis=>`<li>${cardName(card)}　${stage(axis)}：未計算${axis.reason?`（${escape(axis.reason)}）`:''}</li>`));
    const resources=consumption.map(({resource,rows,quantity})=>{
      const {stock,shortage}=byId.get(resource.id)!;
      const unit=resource.unit==='exp'?'EXP':resource.unit==='card'?'枚':'個';
      return `<details class="growth-detail" data-material-resource="${escape(resource.id)}"><summary class="material-columns"><span class="material-name">${escape(resource.name)}<small>（${unit}）</small></span><strong data-material-required>${number(quantity)}</strong><span data-material-stock>${stock===null?'—':number(stock)}</span><strong data-material-shortage class="${shortage!==null&&shortage>0?'material-shortage':''}">${shortage===null?'—':number(shortage)}</strong></summary><ul class="material-consumers">${rows.map(({card,axis,quantity})=>`<li data-material-consumer="${card.kind}-${card.cardId}" data-axis="${axis.axis}" data-quantity="${quantity}">${cardName(card)}　${stage(axis)}　<strong>${number(quantity)}</strong> ${unit}</li>`).join('')}</ul></details>`;
    }).join('');
    return `<section data-material-kind="${kind}"><h3>${kind==='member'?'メンバー':'スナップ'}</h3>${unavailable.length?'<p class="warning">計算済み小計：必要・不足は計算済み分に対する値です。全体の不足は未確定です。</p>':''}${resources?'<div class="material-columns material-column-headings"><span>素材名</span><span>必要</span><span>在庫</span><span>不足</span></div>':''}${resources}${!resources?`<p>${unavailable.length?'要求量は未確定です。':'追加の要求量なし'}</p>`:''}${unavailable.length?`<details data-material-unavailable><summary>未計算項目（${unavailable.length}）</summary><ul>${unavailable.join('')}</ul></details>`:''}</section>`;
  }).join('');
  return `<div class="growth-page"><section class="panel" data-material-total><h2>必要素材</h2><button type="button" class="secondary" data-material-copy>不足状況をコピー</button><p role="status" data-material-copy-status></p>
    <p class="muted material-help">在庫未登録は — · 素材を開くと消費内訳を表示</p>
    ${result.materials.incomplete?'<p class="warning">未計算項目あり・計算済み分の小計</p>':''}
    ${!master.materialDefinition?'<p class="warning">素材マスタ未登録・未計算です。</p>':''}
    ${sections}
    </section></div>`;
}

/** Shared section projection for both the screen and clipboard. */
function materialSection(materials:Simulation['materials'],collection:Collection,kind:'member'|'snap') {
    const cards=materials.cards.filter(c=>c.kind===kind);
    const pending=cards.flatMap(card=>card.axes.filter(a=>a.status==='unavailable'));
    const consumers=materialConsumers(materials);
    const consumption=materials.resources.map(resource=>{
      const rows=(consumers.get(resource.id)??[]).filter(c=>c.card.kind===kind);
      return {resource,rows,quantity:rows.reduce((sum,row)=>sum+row.quantity,0)};
    }).filter(row=>row.rows.length);
    // Compare each section's existing subtotal with actual stock. No stock is consumed.
    const {balances}=materialInventoryBalances({...materials,cards,
      totals:consumption.map(({resource,quantity})=>({resourceId:resource.id,quantity})),
      incomplete:pending.length>0},collection.resourceInventory);
    const byId=new Map(balances.map(balance=>[balance.resource.id,balance]));

  return {cards,pending,consumption,byId};
}

export function materialShortageText(master:Masterdata,collection:Collection,settings:TrainingSettings):string {
  const result=simulateTrainingEvaluation(master,collection,settings);
  // Keep catalog text inside one TSV cell, even when it contains tabs/newlines.
  const cell=(value:unknown)=>String(value).replace(/[\t\r\n]+/g,' ');
  const lines=['必要素材・不足状況','共通育成条件'];
  const fields=[['trainingStage','メンバー 特訓'],['awakeningStage','メンバー 覚醒'],['liveSkillLevel','メンバー ライブスキルLv'],['gekisouSkillLevel','メンバー 撃奏スキルLv'],['snapRank','スナップ 上限解放']] as const;
  for(const [key,label] of fields)lines.push(label+'：'+(settings[key]??'変更しない'));
  lines.push('メンバー／スナップ Lv：育成後の段階の上限まで（現在値を下げず合法な目標を適用）');
  lines.push('在庫未登録は不足未確認。区分ごとに在庫を比較し、区分間の在庫分配は行わない。');
  if(!master.materialDefinition)lines.push('素材マスタ未登録・必要量未計算');
  lines.push(['区分','素材ID','名称','単位','必要数','登録済み在庫数','不足数','状態'].join('\t'));
  for(const kind of ['member','snap'] as const) {
    const label=kind==='member'?'メンバー':'スナップ';
    const {pending,consumption,byId}=materialSection(result.materials,collection,kind);
    for(const {resource,quantity} of consumption.filter(row=>row.quantity>0)) {
      const {stock,shortage}=byId.get(resource.id)!;
      lines.push([label,resource.id,resource.name,resource.unit==='exp'?'EXP':resource.unit==='card'?'枚':'個',quantity,stock??'未登録',shortage??'未確認',
        [pending.length?'計算済み小計・必要量と全体の不足は未確定':'必要量計算済み',stock===null?'在庫未登録':'在庫登録済み'].join('／')].map(cell).join('\t'));
    }
    if(!consumption.some(row=>row.quantity>0))lines.push(label+'：'+(pending.length?'必要量未計算':'追加の要求量なし'));
    const counts=new Map<string,number>();
    for(const axis of pending) {
      const key=labels[axis.axis]+'：'+(axis.reason??'理由未登録');
      counts.set(key,(counts.get(key)??0)+1);
    }
    for(const [reason,count] of counts)lines.push(cell(label+' 未計算：'+reason+'（'+count+'項目）'));
  }
  return lines.join('\n');
}

export function bindMaterialCopy(host:HTMLElement,getText:()=>string):void {
  const button=host.querySelector<HTMLButtonElement>('[data-material-copy]');
  const status=host.querySelector<HTMLElement>('[data-material-copy-status]');
  if(!button||!status)return;
  button.addEventListener('click',async()=>{
    button.disabled=true;
    status.textContent='';
    try {
      await navigator.clipboard.writeText(getText());
      status.textContent='不足状況をコピーしました';
    } catch {
      status.textContent='コピーに失敗しました。ブラウザのクリップボード権限を確認してください。';
    } finally {button.disabled=false;}
  });
}
