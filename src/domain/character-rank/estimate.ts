import type { Masterdata } from '../../data/catalog/model';
import type { Collection } from '../../storage/collection';
import type { AchievementDefinition, ManualProgressKey } from './definitions';
import { assertRankRulesCatalog } from './rules';
import type { BoundRankRules } from './rules';
export function rankFromExp(exp:number,rules:BoundRankRules):number {
  if(!Number.isSafeInteger(exp)||exp<0)throw new Error('EXPは0以上の安全な整数が必要です');
  return [...rules.document.rankThresholds].reverse().find(row=>row.exp<=exp)!.rank;
}
export interface AchievementResult {definition:AchievementDefinition;value:number|undefined;completed:number;exp:number}
function estimate(master:Masterdata,collection:Collection,characterId:number,rules?:BoundRankRules) {
  if(!master.characters.some(c=>c.id===characterId))throw new Error('未登録のキャラクターです');
  const overrideRank=collection.characterRanks[characterId];
  const details:AchievementResult[]=[];
  const manual=collection.characterProgress?.[characterId];
  if(rules) {
    const members=collection.members.filter(m=>master.members.some(row=>row.id===m.cardId&&row.characterId===characterId));
    const snaps=collection.snaps.filter(s=>master.snaps.some(row=>row.id===s.supportCardId&&row.characterIds.includes(characterId)));
    for(const definition of rules.document.achievements) {
      const {kind,stage}=definition;
      const value=kind==='members'?members.length:kind==='snaps'?snaps.length
        :kind==='training'?members.filter(m=>m.trainingStage>=stage!).length
        :kind==='awakening'?members.filter(m=>m.awakeningStage>=stage!).length
        :kind==='snapRank'?snaps.filter(s=>s.rank>=stage!).length
        :kind==='skills'?members.reduce((sum,m)=>sum+[m.awakeningStage,m.liveSkillLevel,m.gekisouSkillLevel].filter(level=>level>=stage!).length,0)
        :manual?.[kind];
      const completed=value===undefined?0:definition.thresholds.filter(t=>value>=t).length;
      details.push({definition,value,completed,exp:completed*definition.exp});
    }
  }
  const exp=rules?details.reduce((sum,d)=>sum+d.exp,0):null;
  if(exp!==null&&!Number.isSafeInteger(exp))throw new Error('EXPの合計が大きすぎます');
  const estimatedRank=exp===null?null:rankFromExp(exp,rules!);
  const chosen=overrideRank??estimatedRank;
  const effectiveRank=chosen!==null&&master.characterRankLevels.includes(chosen)?chosen:null;
  return {exp,estimatedRank,overrideRank,effectiveRank,details,
    reason:effectiveRank===null?(chosen===null?'ランク定義をImportするか手入力ランクを設定してください':'マスタに対応するランク行がありません'):null,
    missingProgress:(rules?.document.manualProgress.map(p=>p.key)??[] as ManualProgressKey[]).filter(key=>manual?.[key]===undefined)};
}
export function estimateCharacterRank(master:Masterdata,collection:Collection,characterId:number,rules?:BoundRankRules) {
  if(rules)assertRankRulesCatalog(rules,master);
  return estimate(master,collection,characterId,rules);
}
export function estimateCharacterRanks(master:Masterdata,collection:Collection,rules?:BoundRankRules) {
  if(rules)assertRankRulesCatalog(rules,master);
  return master.characters.map(c=>({id:c.id,...estimate(master,collection,c.id,rules)}));
}
export function sumCharacterRanks(ranks:readonly {effectiveRank:number|null}[]):number|null {
  if(!ranks.length||ranks.some(r=>r.effectiveRank===null))return null;
  const total=ranks.reduce((sum,r)=>sum+r.effectiveRank!,0);
  if(!Number.isSafeInteger(total))throw new Error('総合キャラクターランクが大きすぎます');
  return total;
}
export function totalCharacterRank(master:Masterdata,collection:Collection,rules?:BoundRankRules):number|null {
  return sumCharacterRanks(estimateCharacterRanks(master,collection,rules));
}
