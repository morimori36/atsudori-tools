import { cardIdentity } from './card-identity';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { simulateTrainingEvaluation } from '../app/training-simulation';
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
  const consumers=materialConsumers(result.materials);
  const cardName=(card:CardRequirement)=>cardIdentity(card.kind==='member'?master.members.find(m=>m.id===card.cardId)!:master.snaps.find(s=>s.id===card.cardId)!);
  const stage=(axis:CardRequirement['axes'][number])=>`${labels[axis.axis]}${number(axis.current)}→${number(axis.target)}`;
  const sections=(['member','snap'] as const).map(kind=>{
    const cards=result.materials.cards.filter(c=>c.kind===kind);
    const unavailable=cards.flatMap(card=>card.axes.filter(a=>a.status==='unavailable').map(axis=>`<li>${cardName(card)}　${stage(axis)}：未計算${axis.reason?`（${escape(axis.reason)}）`:''}</li>`));
    const consumption=result.materials.resources.map(resource=>{
      const rows=(consumers.get(resource.id)??[]).filter(c=>c.card.kind===kind);
      return {resource,rows,quantity:rows.reduce((sum,row)=>sum+row.quantity,0)};
    }).filter(row=>row.rows.length);
    // Compare each section's existing subtotal with actual stock. No stock is consumed.
    const {balances}=materialInventoryBalances({...result.materials,cards,
      totals:consumption.map(({resource,quantity})=>({resourceId:resource.id,quantity})),
      incomplete:unavailable.length>0},collection.resourceInventory);
    const byId=new Map(balances.map(balance=>[balance.resource.id,balance]));
    const resources=consumption.map(({resource,rows,quantity})=>{
      const {stock,shortage}=byId.get(resource.id)!;
      const unit=resource.unit==='exp'?'EXP':resource.unit==='card'?'枚':'個';
      return `<details class="growth-detail" data-material-resource="${escape(resource.id)}"><summary class="material-columns"><span class="material-name">${escape(resource.name)}<small>（${unit}）</small></span><strong data-material-required>${number(quantity)}</strong><span data-material-stock>${stock===null?'—':number(stock)}</span><strong data-material-shortage class="${shortage!==null&&shortage>0?'material-shortage':''}">${shortage===null?'—':number(shortage)}</strong></summary><ul class="material-consumers">${rows.map(({card,axis,quantity})=>`<li data-material-consumer="${card.kind}-${card.cardId}" data-axis="${axis.axis}" data-quantity="${quantity}">${cardName(card)}　${stage(axis)}　<strong>${number(quantity)}</strong> ${unit}</li>`).join('')}</ul></details>`;
    }).join('');
    return `<section data-material-kind="${kind}"><h3>${kind==='member'?'メンバー':'スナップ'}</h3>${unavailable.length?'<p class="warning">計算済み小計：必要・不足は計算済み分に対する値です。全体の不足は未確定です。</p>':''}${resources?'<div class="material-columns material-column-headings"><span>素材名</span><span>必要</span><span>在庫</span><span>不足</span></div>':''}${resources}${!resources?`<p>${unavailable.length?'要求量は未確定です。':'追加の要求量なし'}</p>`:''}${unavailable.length?`<details data-material-unavailable><summary>未計算項目（${unavailable.length}）</summary><ul>${unavailable.join('')}</ul></details>`:''}</section>`;
  }).join('');
  return `<div class="growth-page"><section class="panel" data-material-total><h2>必要素材</h2>
    <p class="muted material-help">在庫未登録は — · 素材を開くと消費内訳を表示</p>
    ${result.materials.incomplete?'<p class="warning">未計算項目あり・計算済み分の小計</p>':''}
    ${!master.materialDefinition?'<p class="warning">素材マスタ未登録・未計算です。</p>':''}
    ${sections}
    </section></div>`;
}
