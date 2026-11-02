import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { calculateMaterialRequirements } from '../domain/materials/calculate';
import type { MaterialAmount, MaterialAxis } from '../domain/materials/model';
const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const labels:Record<MaterialAxis,string>={trainingStage:'特訓',awakeningStage:'覚醒',liveSkillLevel:'ライブスキル',gekisouSkillLevel:'撃奏スキル',level:'レベル',rank:'Snap上限解放'};
export function materialsPage(master:Masterdata,collection:Collection):string {
  const result=calculateMaterialRequirements(master,collection);
  const list=(amounts:MaterialAmount[]):string=>amounts.length?`<ul>${amounts.map(a=>{
    const r=result.resources.find(r=>r.id===a.resourceId)!;
    return `<li>${escape(r.name)}：<strong>${a.quantity.toLocaleString('ja-JP')}</strong> ${r.unit==='exp'?'EXP（Lv開始時点からの上限）':r.unit==='card'?'枚':'個'}</li>`;
  }).join('')}</ul>`:'<p>要求量なし（計算できた項目のみ）</p>';
  return `<section class="panel"><h2>所持カード全体の素材別合計</h2><p>現在の所持から、マスタに定義された合法的な最大段階まで計算します。仮育成設定や素材の所持数は適用しません。</p>
    ${!master.materialDefinition?'<p class="warning">素材マスタ未登録です。素材定義を含むcatalogをImportしてください。</p>':''}
    ${result.incomplete?'<p class="warning">未計算項目があります。以下は計算済み分の小計で、最大育成の全費用ではありません。</p>':''}
    ${list(result.totals)}<p>EXPはアイテム個数と別の要求量です。途中EXPを保持していないため実際の残りEXPは確定できません。</p></section>
    ${!result.cards.length?'<section class="panel"><p>所持カードがありません。メンバー・Snap画面で登録してください。</p></section>':''}
    ${result.cards.map(card=>{
      const c=card.kind==='member'?master.members.find(c=>c.id===card.cardId)!:master.snaps.find(c=>c.id===card.cardId)!;
      return `<section class="panel" data-material-card="${card.kind}-${card.cardId}"><h2>${card.kind==='member'?'メンバー':'Snap'}：${escape(c.name)}［${escape(c.title)}］</h2>
        <h3>カードの素材別小計</h3>${list(card.amounts)}<details><summary>育成項目別の内訳</summary>${card.axes.map(a=>`<div class="material-axis"><h3>${labels[a.axis]}：${a.current} → ${a.target??'不明'}</h3>
          <p>${a.status==='complete'?'最大段階に到達済み':a.status==='unavailable'?'計算不能':a.status==='bounded'?'EXPの上限を計算':'計算済み'}</p>
          ${a.status==='unavailable'||a.status==='complete'?'':list(a.amounts)}${a.reason?`<p>${escape(a.reason)}</p>`:''}${a.basis?`<p class="muted">費用の根拠：${escape(a.basis)}</p>`:''}</div>`).join('')}</details></section>`;
    }).join('')}`;
}
