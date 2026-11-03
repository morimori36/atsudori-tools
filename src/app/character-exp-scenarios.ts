import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from '../storage/collection';
import type { Collection, OwnedMember } from '../storage/collection';
import type { SnapProgression } from '../data/catalog/growth';
import { applyTrainingConditions } from './training-conditions';
import { trainingConditions } from './hypothetical-training';
import type { TrainingSettings } from './hypothetical-training';
import { estimateCharacterRanks } from '../domain/character-rank/estimate';
import { estimateBondRankTheory } from '../domain/character-rank/bond-theory';
import { catalogRankRules } from '../domain/character-rank/rules';

export type ExpResult<T> = { status:'ready'; value:T } | { status:'pending'; reason:string };
export interface ExpGoal { rank:number; exp:number; missingExp:number; reached:boolean }
export interface ExpCard {
  kind:'member'|'snap'; id:number; name:string; title:string; characterIds:number[]; owned:boolean;
}
const pending = (reason:string):ExpResult<never> => ({status:'pending',reason});
const attempt = <T>(run:()=>T):ExpResult<T> => {
  try { return {status:'ready',value:run()}; }
  catch { return pending('マスタ・所持・育成条件が不正または定義が不足しています。'); }
};
const minimum = (rows:number[]) => {
  if (!rows.length) throw new Error('Missing initial progression');
  return Math.min(...rows);
};

/** Every projection uses the existing progression, achievement and iterative bond engines.
 * Only the bond achievement is excluded from direct EXP; manual progress stays intact.
 * Caches live for this input/settings snapshot. Individual projections are lazy.
 */
export function createCharacterExpScenarios(master:Masterdata, input:Collection, settings:TrainingSettings, trained?:Collection) {
  const conditions=trainingConditions(settings);
  const source=attempt(()=>validateCollection(input,master));
  const rules=attempt(()=>catalogRankRules(master));
  const cards:ExpCard[]=[
    ...master.members.map(c=>({kind:'member' as const,id:c.id,name:c.name,title:c.title,characterIds:[c.characterId],owned:input.members.some(m=>m.cardId===c.id)})),
    ...master.snaps.map(c=>({kind:'snap' as const,id:c.id,name:c.name,title:c.title,characterIds:c.characterIds,owned:input.snaps.some(s=>s.supportCardId===c.id)})),
  ];
  function projection(collection:ExpResult<Collection>) {
    const ranks=collection.status==='pending'?collection:attempt(()=> {
      if(rules.status==='pending'||!rules.value)throw new Error('Missing rules');
      return estimateCharacterRanks(master,collection.value,rules.value);
    });
    const theories=new Map<number,ExpResult<ReturnType<typeof estimateCharacterRanks>>>();
    return {collection,
      direct(id:number):ExpResult<number> {
        if(ranks.status==='pending')return ranks;
        const row=ranks.value.find(r=>r.id===id);
        if(!row||row.exp===null)return pending('キャラEXPのランク定義がありません。');
        return {status:'ready',value:row.details.filter(d=>d.definition.kind!=='bondRankTotal').reduce((sum,d)=>sum+d.exp,0)};
      },
      goal(id:number,targetRank:number):ExpResult<ExpGoal> {
        const character=master.characters.find(c=>c.id===id);
        if(!character||collection.status==='pending')return pending('対象キャラまたは育成状態を算出できません。');
        if(rules.status==='pending')return rules;
        const threshold=rules.value?.document.rankThresholds.find(r=>r.rank===targetRank);
        if(!master.characterRankLevels.includes(targetRank)||!threshold)return pending('目標ランクに対応する累積EXP定義がありません。');
        if(!theories.has(character.bandId)) {
          const theory=estimateBondRankTheory(master,collection.value,character.bandId);
          theories.set(character.bandId,theory.status==='pending'?theory:attempt(()=> {
            const projected=structuredClone(collection.value);
            projected.characterRanks={};
            for(const row of theory.characters) {
              projected.characterProgress??={};
              projected.characterProgress[row.id]={...projected.characterProgress[row.id],bondRankTotal:row.bondRankTotal};
            }
            return estimateCharacterRanks(master,projected,rules.value);
          }));
        }
        const final=theories.get(character.bandId)!;
        if(final.status==='pending')return final;
        const row=final.value.find(r=>r.id===id);
        if(!row||row.exp===null||row.effectiveRank===null)return pending('絆理論値の最終EXP・ランクを算出できません。');
        return {status:'ready',value:{rank:row.effectiveRank,exp:row.exp,missingExp:Math.max(threshold.exp-row.exp,0),reached:row.effectiveRank>=targetRank}};
      },
    };
  }
  const current=projection(source);
  const target=projection(attempt(()=> {
    if(source.status==='pending')throw new Error('Invalid source');
    return trained?validateCollection(trained,master):applyTrainingConditions(master,source.value,conditions);
  }));
  const progress=new Map<string,ExpResult<OwnedMember|SnapProgression>>();
  function trainedCard(card:ExpCard):ExpResult<OwnedMember|SnapProgression> {
    const key=`${card.kind}:${card.id}`;
    if(!progress.has(key))progress.set(key,attempt(()=> {
      if(target.collection.status==='pending'||source.status==='pending')throw new Error('Invalid projection');
      if(card.owned)return (card.kind==='member'?target.collection.value.members.find(m=>m.cardId===card.id):target.collection.value.snaps.find(s=>s.supportCardId===card.id))!;
      // Imported legal minima define the acquisition state. Missing rows are never filled with 1.
      const one={...source.value,members:[] as OwnedMember[],snaps:[] as SnapProgression[]};
      if(card.kind==='member') {
        const c=master.members.find(m=>m.id===card.id)!;
        const trainingStage=minimum(master.memberTraining.filter(r=>r.group===c.trainingGroup).map(r=>r.stage));
        const cap=master.memberLevelLimits.find(r=>r.rarity===c.rarity&&r.trainingStage===trainingStage);
        if(!cap)throw new Error('Missing cap');
        one.members=[{cardId:c.id,trainingStage,level:minimum(master.memberLevels.filter(r=>r.group===c.levelGroup&&r.level<=cap.limitLevel).map(r=>r.level)),
          awakeningStage:minimum(master.memberAwakening.filter(r=>r.group===c.awakeningGroup).map(r=>r.stage)),liveSkillLevel:minimum(c.liveSkillLevels),gekisouSkillLevel:minimum(c.gekisouSkillLevels)}];
      } else {
        const c=master.snaps.find(s=>s.id===card.id)!;
        const rank=minimum(master.snapRanks.filter(r=>r.group===c.rankGroup).map(r=>r.rank));
        const cap=master.snapRanks.find(r=>r.group===c.rankGroup&&r.rank===rank)!;
        one.snaps=[{supportCardId:c.id,rank,level:minimum(master.snapLevels.filter(r=>r.group===c.levelGroup&&r.level<=cap.limitLevel).map(r=>r.level))}];
      }
      const after=applyTrainingConditions(master,one,conditions);
      return (card.kind==='member'?after.members[0]:after.snaps[0])!;
    }));
    return progress.get(key)!;
  }
  function change(base:ExpResult<Collection>, changed:ExpCard[]):ExpResult<Collection> {
    return attempt(()=> {
      if(base.status==='pending')throw new Error('Invalid baseline');
      const next=structuredClone(base.value);
      const members=new Map(next.members.map(m=>[m.cardId,m]));
      const snaps=new Map(next.snaps.map(s=>[s.supportCardId,s]));
      for(const card of changed) {
        const state=trainedCard(card);
        if(state.status==='pending')throw new Error('Missing legal progression');
        if(card.kind==='member')members.set(card.id,state.value as OwnedMember);
        else snaps.set(card.id,state.value as SnapProgression);
      }
      next.members=[...members.values()];next.snaps=[...snaps.values()];
      return validateCollection(next,master);
    });
  }
  const delta=(before:ReturnType<typeof projection>,after:ReturnType<typeof projection>,id:number):ExpResult<number>=> {
    const a=before.direct(id),b=after.direct(id);
    return a.status==='pending'?a:b.status==='pending'?b:{status:'ready',value:b.value-a.value};
  };
  const acquisitionGains=new Map<number,ExpResult<number>>();
  const directGains=new Map<string,ExpResult<number>>();
  // Retain scalar gains, not a full ownership snapshot per candidate during sorting.
  const singleProjection=(card:ExpCard)=>projection(change((card.owned?current:target).collection,[card]));
  const related=(id:number,owned:boolean)=>cards.filter(c=>c.owned===owned&&c.characterIds.includes(id));
  return {
    cards:related,
    direct(card:ExpCard,id:number) {
      const key=`${card.kind}:${card.id}:${id}`;
      if(!directGains.has(key))directGains.set(key,delta(card.owned?current:target,singleProjection(card),id));
      return directGains.get(key)!;
    },
    summary(id:number,targetRank:number) {
      if(!acquisitionGains.has(id))acquisitionGains.set(id,delta(target,projection(change(target.collection,related(id,false))),id));
      return {owned:delta(current,target,id),unowned:acquisitionGains.get(id)!,goal:target.goal(id,targetRank)};
    },
    detail(card:ExpCard,id:number,targetRank:number) {
      const base=card.owned?current:target;
      const single=singleProjection(card);
      const direct=delta(base,single,id);
      const goal=single.goal(id,targetRank),beforeGoal=base.goal(id,targetRank);
      const indirect:ExpResult<number>=direct.status==='pending'?direct:goal.status==='pending'?goal:beforeGoal.status==='pending'?beforeGoal:
        {status:'ready',value:goal.value.exp-beforeGoal.value.exp-direct.value};
      const original=source.status==='ready'?(card.kind==='member'?source.value.members.find(m=>m.cardId===card.id):source.value.snaps.find(s=>s.supportCardId===card.id)):undefined;
      return {direct,goal,indirect,before:original,after:trainedCard(card)};
    },
  };
}

export function legalExpTarget(master:Masterdata,requested=30):number|undefined {
  const ranks=[...master.characterRankLevels].sort((a,b)=>a-b);
  return ranks.includes(requested)?requested:ranks.includes(30)?30:ranks.filter(r=>r<=30).at(-1)??ranks[0];
}
