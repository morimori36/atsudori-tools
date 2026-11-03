import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { simulateTrainingEvaluation } from '../app/training-simulation';
import type { TrainingSettingsStore } from '../storage/training-settings';
import { trainingSettingsMarkup } from './training-settings';
import type { CardRequirement } from '../domain/materials/calculate';
import type { MaterialAxis } from '../domain/materials/model';
import { progressCharacters } from './character-order';
const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(v:number|null|undefined):string=>v==null?'保留':v.toLocaleString('ja-JP');
const labels:Record<MaterialAxis,string>={trainingStage:'特訓',awakeningStage:'覚醒',liveSkillLevel:'ライブスキル',gekisouSkillLevel:'撃奏スキル',level:'レベル',rank:'Snap上限解放'};
type Simulation=ReturnType<typeof simulateTrainingEvaluation>;

export function createMaterialsPage(master:Masterdata,collection:Collection,settings:TrainingSettingsStore) {
  const result=simulateTrainingEvaluation(master,collection,settings.current());
  return { html:trainingSettingsMarkup(settings)+materialsPage(master,result) };
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

function materialsPage(master:Masterdata,result:Simulation):string {
  const consumers=materialConsumers(result.materials);
  const cardName=(card:CardRequirement)=>{
    const row=card.kind==='member'?master.members.find(m=>m.id===card.cardId)!:master.snaps.find(s=>s.id===card.cardId)!;
    return `${card.kind==='member'?'Member':'Snap'} ${escape(row.name)}［${escape(row.title)}］`;
  };
  const evidence=(axis:CardRequirement['axes'][number])=>`<details><summary>計算詳細</summary><p>${labels[axis.axis]}：${number(axis.current)} → ${number(axis.target)}</p>${axis.reason?`<p>${escape(axis.reason)}</p>`:''}${axis.basis?`<p>計算根拠：${escape(axis.basis)}</p>`:''}</details>`;
  const resources=(exp:boolean)=>result.materials.totals.filter(a=>(result.materials.resources.find(r=>r.id===a.resourceId)!.unit==='exp')===exp).map(a=>{
    const resource=result.materials.resources.find(r=>r.id===a.resourceId)!;
    const unit=resource.unit==='exp'?'EXP':resource.unit==='card'?'枚':'個';
    return `<details class="growth-detail" data-material-resource="${escape(a.resourceId)}"><summary><span>${escape(resource.name)}</span>：<strong>${number(a.quantity)}</strong> ${unit}${exp?'（上限）':''}</summary><ul class="material-consumers">${(consumers.get(a.resourceId)??[]).map(({card,axis,quantity})=>`<li data-material-consumer="${card.kind}-${card.cardId}" data-axis="${axis.axis}" data-quantity="${quantity}">${cardName(card)}／${labels[axis.axis]}：<strong>${number(quantity)}</strong> ${unit}${evidence(axis)}</li>`).join('')}</ul></details>`;
  }).join('');
  const unavailable=result.materials.cards.flatMap(card=>card.axes.filter(a=>a.status==='unavailable').map(axis=>`<li>${cardName(card)}／${labels[axis.axis]}：未計算${evidence(axis)}</li>`));
  const theories=new Map(master.bands.map(b=>[b.id,result.bondTheory(b.id)]));
  const name=(id:number)=>escape(master.characters.find(c=>c.id===id)!.name);
  return `<div class="growth-page"><section class="panel" data-material-total><h2>必要素材</h2>
    ${result.materials.incomplete?'<p class="warning">未計算項目あり・計算済み分の小計</p>':''}
    ${!master.materialDefinition?'<p class="warning">素材マスタ未登録・未計算です。</p>':''}
    ${resources(false)}${result.materials.totals.some(a=>result.materials.resources.find(r=>r.id===a.resourceId)!.unit==='exp')?'<h3>育成EXP（上限）</h3>':''}${resources(true)}
    ${!result.materials.totals.length?`<p>${result.materials.incomplete?'要求量は未確定です。':'追加の要求量なし'}</p>`:''}
    ${unavailable.length?`<details data-material-unavailable><summary>未計算項目（${unavailable.length}）</summary><ul>${unavailable.join('')}</ul></details>`:''}
    <details><summary>素材計算の注意</summary><p>全所持Member・Snapの費用を一度ずつ合算します。共有SnapをMember側へ重複加算しません。費用定義の欠落は0として扱いません。素材の所持数・不足数は対象外です。EXPは現在Lv内の途中EXPが不明なため必要量の上限です。アイテム個数へ換算しません。</p></details>
    </section><section class="panel" data-bond-theory><h2>絆理論値</h2><p class="muted">理論上の到達値です。実際の獲得済み絆ランクとは異なります。</p><details><summary>計算条件</summary><p>手入力キャラランク・絆合計の上書きを除外し、既存の収束計算を使用します。</p></details>
    <div class="bond-heading" aria-hidden="true"><span>キャラ</span><span>最終キャラランク</span><span>最終絆合計</span></div>
    ${progressCharacters(master.characters).map(character=>{
      const theory=theories.get(character.bandId)!;
      if(theory.status==='pending')return `<div class="bond-pending" data-bond-character="${character.id}"><strong>${escape(character.name)}</strong><p class="warning">未算出：${escape(theory.reason)}</p></div>`;
      const row=theory.characters.find(c=>c.id===character.id)!;
      return `<details class="growth-detail" data-bond-character="${row.id}"><summary class="bond-summary"><span>${escape(character.name)}</span><span aria-label="最終キャラランク">${number(row.finalRank)}</span><span aria-label="最終絆合計">${number(row.bondRankTotal)}</span></summary>${row.missingProgress.length?'<p class="muted">絆以外の未入力進捗による不確実性があります。</p>':''}<ul class="bond-pairs">${theory.pairs.filter(p=>p.characterA===row.id||p.characterB===row.id).map(p=>`<li data-bond-rank="${p.rank}">${name(p.characterA)} × ${name(p.characterB)}：<strong>${number(p.rank)}</strong></li>`).join('')||'<li>対象ペアなし</li>'}</ul></details>`;
    }).join('')}</section></div>`;
}
