import { createCharacterExpView } from './character-exp';
import type { ExpView } from './character-exp';
import { cardIdentity } from './card-identity';
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
const labels:Record<MaterialAxis,string>={trainingStage:'特訓',awakeningStage:'覚醒',liveSkillLevel:'ライブスキル',gekisouSkillLevel:'撃奏スキル',level:'レベル',rank:'上限解放'};
type Simulation=ReturnType<typeof simulateTrainingEvaluation>;

export function createMaterialsPage(master:Masterdata,collection:Collection,settings:TrainingSettingsStore,expState:ExpView={targetRank:30}) {
  const result=simulateTrainingEvaluation(master,collection,settings.current());
  const expView=createCharacterExpView(master,collection,settings.current(),result.target,expState);
  return { html:trainingSettingsMarkup(settings)+materialsPage(master,result,expView), bind:expView.bind };
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

function materialsPage(master:Masterdata,result:Simulation,expView:ReturnType<typeof createCharacterExpView>):string {
  const consumers=materialConsumers(result.materials);
  const cardName=(card:CardRequirement)=>cardIdentity(card.kind==='member'?master.members.find(m=>m.id===card.cardId)!:master.snaps.find(s=>s.id===card.cardId)!);
  const stage=(axis:CardRequirement['axes'][number])=>`${labels[axis.axis]}${number(axis.current)}→${number(axis.target)}`;
  const sections=(['member','snap'] as const).map(kind=>{
    const cards=result.materials.cards.filter(c=>c.kind===kind);
    const unavailable=cards.flatMap(card=>card.axes.filter(a=>a.status==='unavailable').map(axis=>`<li>${cardName(card)}　${stage(axis)}：未計算${axis.reason?`（${escape(axis.reason)}）`:''}</li>`));
    const resources=result.materials.resources.map(resource=>{
      const rows=(consumers.get(resource.id)??[]).filter(c=>c.card.kind===kind);
      if(!rows.length)return '';
      // Sum existing calculated consumption only; incomplete results remain explicitly subtotals.
      const quantity=rows.reduce((sum,row)=>sum+row.quantity,0);
      const unit=resource.unit==='exp'?'EXP':resource.unit==='card'?'枚':'個';
      return `<details class="growth-detail" data-material-resource="${escape(resource.id)}"><summary><span>${escape(resource.name)}</span>：<strong>${number(quantity)}</strong> ${unit}${resource.unit==='exp'?'（上限）':''}${unavailable.length?'（計算済み小計）':''}</summary><ul class="material-consumers">${rows.map(({card,axis,quantity})=>`<li data-material-consumer="${card.kind}-${card.cardId}" data-axis="${axis.axis}" data-quantity="${quantity}">${cardName(card)}　${stage(axis)}　<strong>${number(quantity)}</strong> ${unit}</li>`).join('')}</ul></details>`;
    }).join('');
    return `<section data-material-kind="${kind}"><h3>${kind==='member'?'メンバー':'スナップ'}</h3>${resources}${!resources?`<p>${unavailable.length?'要求量は未確定です。':'追加の要求量なし'}</p>`:''}${unavailable.length?`<details data-material-unavailable><summary>未計算項目（${unavailable.length}）</summary><ul>${unavailable.join('')}</ul></details>`:''}</section>`;
  }).join('');
  const bands=master.bands.map(band=>{
    const theory=result.bondTheory(band.id);
    const characters=progressCharacters(master.characters.filter(c=>c.bandId===band.id));
    return `<section data-bond-band="${band.id}"><h3>${escape(band.name)}</h3><div class="bond-cards" role="region" aria-label="${escape(band.name)}の絆理論値" tabindex="0">${characters.map(character=>{
      if(theory.status==='pending')return `<details class="bond-card" data-bond-character="${character.id}"><summary><h4>${escape(character.name)}</h4><span>最終キャラランク：未算出</span><span>最終絆ランク合計：未算出</span>${expView.summary(character.id)}</summary><p class="warning">未算出：${escape(theory.reason)}</p>${expView.button(character.id)}</details>`;
      const row=theory.characters.find(c=>c.id===character.id)!;
      const pairs=characters.filter(c=>c.id!==row.id).flatMap(other=>{
        const pair=theory.pairs.find(p=>(p.characterA===row.id&&p.characterB===other.id)||(p.characterB===row.id&&p.characterA===other.id));
        return pair?[`<tr data-bond-rank="${pair.rank}"><th scope="row">${escape(other.name)}</th><td>${number(pair.rank)}</td></tr>`]:[];
      }).join('');
      return `<details class="bond-card" data-bond-character="${row.id}"><summary><h4>${escape(character.name)}</h4><span>最終キャラランク <strong aria-label="最終キャラランク">${number(row.finalRank)}</strong></span><span>最終絆ランク合計 <strong aria-label="最終絆合計">${number(row.bondRankTotal)}</strong></span>${expView.summary(row.id)}</summary>${row.missingProgress.length?'<p class="muted">絆以外に未入力の進捗があります。</p>':''}<table class="bond-pairs"><thead><tr><th scope="col">相手</th><th scope="col">絆ランク</th></tr></thead><tbody>${pairs}</tbody></table>${!pairs?'<p>対象ペアなし</p>':''}${expView.button(row.id)}</details>`;
    }).join('')}</div></section>`;
  }).join('');
  return `<div class="growth-page"><section class="panel" data-material-total><h2>必要素材</h2>
    ${result.materials.incomplete?'<p class="warning">未計算項目あり・計算済み分の小計</p>':''}
    ${!master.materialDefinition?'<p class="warning">素材マスタ未登録・未計算です。</p>':''}
    ${sections}
    </section><section class="panel" data-bond-theory><h2>絆理論値</h2><p class="muted">理論上の到達値です。実際の獲得済み絆ランクとは異なります。</p>${expView.targetMarkup}${bands}</section></div>`;
}
