import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { maximumTrainingBondTheory, simulateMaximumTraining } from '../app/maximum-training';
import type { CardRequirement } from '../domain/materials/calculate';
import type { MaterialAmount, MaterialAxis } from '../domain/materials/model';
import type { BondTheoryResult } from '../domain/character-rank/bond-theory';
import { characterRowsForDisplay } from './character-order';
const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(v:number|null|undefined):string=>v==null?'保留':v.toLocaleString('ja-JP');
const comparison=(from:number|null|undefined,to:number|null|undefined):string=>`<strong>${number(from)} → ${number(to)}</strong>${from!=null&&to!=null?` <small>（${to-from>0?'+':''}${number(to-from)}）</small>`:''}`;
const labels:Record<MaterialAxis,string>={trainingStage:'特訓',awakeningStage:'覚醒',liveSkillLevel:'ライブスキル',gekisouSkillLevel:'撃奏スキル',level:'レベル',rank:'Snap上限解放'};
type Simulation=ReturnType<typeof simulateMaximumTraining>;

export function createMaterialsPage(master:Masterdata,collection:Collection) {
  const result=simulateMaximumTraining(master,collection);
  return { html:materialsPage(master,result), bind:(root:HTMLElement)=>bindMaterialsPage(root,master,result.target) };
}

function materialsPage(master:Masterdata,result:Simulation):string {
  const list=(amounts:MaterialAmount[],incomplete=false):string=>{
    const group=(exp:boolean)=>amounts.filter(a=>(result.materials.resources.find(r=>r.id===a.resourceId)!.unit==='exp')===exp);
    const rows=(values:MaterialAmount[])=>`<ul class="material-list">${values.map(a=>{
      const r=result.materials.resources.find(r=>r.id===a.resourceId)!;
      return `<li><span>${escape(r.name)}</span><span><strong>${number(a.quantity)}</strong> ${r.unit==='exp'?'EXP':r.unit==='card'?'枚':'個'}</span></li>`;
    }).join('')}</ul>`;
    return `${incomplete?'<p class="warning">未計算項目あり・計算済み分の小計</p>':''}${group(false).length?rows(group(false)):''}${group(true).length?`<p class="muted material-exp-note">EXP要求量（Lv途中EXP不明のため上限）</p>${rows(group(true))}`:''}${!amounts.length?`<p class="muted">${incomplete?'要求量は未確定です。カードの詳細で理由を確認できます。':'追加の要求量なし'}</p>`:''}`;
  };
  const cardView=(card:CardRequirement):string=>{
    const row=card.kind==='member'?master.members.find(m=>m.id===card.cardId)!:master.snaps.find(s=>s.id===card.cardId)!;
    const changed=card.axes.filter(a=>a.target!==a.current),unchanged=card.axes.filter(a=>a.target===a.current);
    const axisView=(a:CardRequirement['axes'][number])=>`<div class="material-axis"><h4>${labels[a.axis]}：${number(a.current)} → ${number(a.target)}</h4>${a.status==='unavailable'?'<p class="warning">未計算</p>':a.status==='complete'?'<p class="muted">現在段階を維持</p>':list(a.amounts)}${a.status==='bounded'?'':a.reason?`<p>${escape(a.reason)}</p>`:''}${a.basis?`<details><summary>計算根拠</summary><p>${escape(a.basis)}</p></details>`:''}</div>`;
    return `<details class="growth-detail" data-material-card="${card.kind}-${card.cardId}"><summary>${escape(row.name)}［${escape(row.title)}］</summary><div class="growth-content">${list(card.amounts,card.axes.some(a=>a.status==='unavailable'))}${changed.map(axisView).join('')}${unchanged.length?`<details><summary>維持・達成済みの項目（${unchanged.length}）</summary>${unchanged.map(axisView).join('')}</details>`:''}</div></details>`;
  };
  const rankView=(character:Simulation['bands'][number]['characters'][number])=>{
    const a=character.before,b=character.after;
    const manual=a.overrideRank!==undefined;
    return `<p>${manual?`使用ランク：<strong>${number(a.effectiveRank)} → ${number(b.effectiveRank)}</strong>（手入力${number(a.overrideRank)}を維持）<br>参考・自動推定：<strong>${number(a.estimatedRank)} → ${number(b.estimatedRank)}</strong>`:`キャラランク（自動推定）：${comparison(a.estimatedRank,b.estimatedRank)}`}</p>${a.estimatedRank===null||b.estimatedRank===null?'<p class="warning">ランク定義がないため自動推定は保留です。</p>':''}${a.reason||b.reason?`<p class="warning">${escape(a.reason??b.reason)}</p>`:''}${a.missingProgress.length||b.missingProgress.length?'<p class="muted">未入力進捗は加算していません。</p>':''}`;
  };
  const bondLink=(bandId:number,characterId?:number)=>`<details class="growth-detail" data-bond-band="${bandId}" ${characterId===undefined?'':`data-bond-character="${characterId}"`}><summary>${characterId===undefined?'育成後のペア別絆上限':'関係する絆の理論上限'}</summary><div data-bond-output class="growth-content"></div></details>`;
  return `<div class="growth-page"><section class="panel" data-growth-conditions><h2>育成条件</h2><p><strong>凸なし最大育成</strong>：全所持Member・Snapを対象に、覚醒・上限解放段階を維持します。</p>
    <details><summary>育成条件・素材計算の注意</summary><p>Memberは特訓・ライブ／撃奏スキルと最大特訓後のLv、Snapは現在の上限解放段階のLv上限まで育成します。カード追加・凸・進捗獲得・バンドアイテム育成は含めません。保存データは変更しません。</p><p>手入力ランクは維持します。未入力進捗は加算しません。通常の自動推定ランクと絆最大時の理論キャラランクは区別して表示します。</p><p>素材マスタ未登録・費用定義欠落・根拠未確認は未計算です。EXPは現在Lv開始時点からの要求量の上限で、アイテム個数へ換算しません。素材の所持数・不足数は計算しません。</p><p><a href="https://github.com/morimori36/atsudori-tools/blob/main/docs/materials.md" target="_blank" rel="noreferrer">計算と表示の詳細</a></p></details></section>
    <section class="panel" data-material-total><h2>最大育成の必要素材</h2><p class="muted">各Memberと所持Snapの費用を一度ずつ合算。</p>${!master.materialDefinition?'<p class="warning">素材マスタ未登録・未計算です。</p>':''}${list(result.materials.totals,result.materials.incomplete)}</section>
    ${!result.materials.cards.length?'<section class="panel"><p>所持カードがありません。メンバー・Snap画面で登録してください。</p></section>':''}
    <section class="panel"><h2>バンド・キャラ別の内訳</h2><p class="muted">全所持カードを育成する同じシナリオの内訳です。素材小計はMember分のみ。</p>${result.bands.map(band=>`<details class="growth-detail" data-growth-band="${band.id}"><summary>${escape(band.name)}</summary><div class="growth-content"><h3>必要素材（Member分）</h3>${list(band.materials.totals,band.materials.incomplete)}${bondLink(band.id)}<h3>キャラランク・Member内訳</h3>${characterRowsForDisplay(band.characters,master.characters,c=>c.id).map(character=>`<details class="growth-detail" data-growth-character="${character.id}"><summary>${escape(character.name)} <small>ランク ${number(character.before.effectiveRank)} → ${number(character.after.effectiveRank)}${character.before.overrideRank!==undefined?'（手入力維持）':''}</small></summary><div class="growth-content">${rankView(character)}${bondLink(band.id,character.id)}<h4>必要素材（Member分）</h4>${list(character.materials.totals,character.materials.incomplete)}${character.cards.map(cardView).join('')||'<p class="muted">所持Memberなし</p>'}</div></details>`).join('')}</div></details>`).join('')}</section>
    <section class="panel"><details data-snap-materials><summary>Snapの必要素材・カード内訳（${result.snaps.length}枚）</summary><p class="muted">共有Snapもここで一度だけ計上。対応キャラへ費用を重複加算しません。</p>${list(result.snapMaterials.totals,result.snapMaterials.incomplete)}${result.snaps.map(cardView).join('')}</details></section></div>`;
}

/** Compute bond theory once per opened band; keep the initial view and calculation compact. */
function bindMaterialsPage(root:HTMLElement,master:Masterdata,target:Collection):void {
  const cache=new Map<number,BondTheoryResult>();
  root.querySelectorAll<HTMLDetailsElement>('[data-bond-band]').forEach(details=>details.addEventListener('toggle',()=>{
    if(!details.open||details.dataset.loaded)return;
    const bandId=Number(details.dataset.bondBand),characterId=details.dataset.bondCharacter===undefined?undefined:Number(details.dataset.bondCharacter);
    if(!cache.has(bandId))cache.set(bandId,maximumTrainingBondTheory(master,target,bandId));
    const theory=cache.get(bandId)!;
    const name=(id:number)=>escape(master.characters.find(c=>c.id===id)!.name);
    const output=details.querySelector('[data-bond-output]')!;
    output.innerHTML=theory.status==='pending'?`<p class="warning">絆理論値は保留：${escape(theory.reason)}</p>`:`<p class="muted">絆EXP獲得後の理論上限です。実際のペアランクは未登録で、今回の育成結果に加算しません。手入力ランク・絆合計の上書きは使いません。</p>${theory.characters.some(c=>c.missingProgress.length)?'<p class="muted">絆以外の未入力進捗による不確実性があります。</p>':''}<ul class="bond-pairs">${theory.pairs.filter(p=>characterId===undefined||p.characterA===characterId||p.characterB===characterId).map(p=>`<li>${name(p.characterA)} × ${name(p.characterB)}：<strong>上限 ${number(p.rank)}</strong></li>`).join('')||'<li>対象ペアなし</li>'}</ul><details><summary>絆最大時の理論キャラランク</summary><ul>${theory.characters.filter(c=>characterId===undefined||c.id===characterId).map(c=>`<li>${name(c.id)}：${number(c.finalRank)}</li>`).join('')}</ul><p class="muted">ペア上限とキャラランクが安定するまで既存の絆理論値計算で反復します。実際のキャラランク・獲得済み絆ランクとは別の参考値です。</p></details>`;
    details.dataset.loaded='true';
  }));
}
