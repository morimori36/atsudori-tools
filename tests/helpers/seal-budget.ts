import type {FixedSealBudgetDefinition, PlanBenefits} from '../../src/domain/seal-budget/model';
export const fictionalPlanBenefits = (): NonNullable<FixedSealBudgetDefinition['planBenefits']> => Object.fromEntries(
 ['none', 'lite', 'standard', 'premium'].map(plan => [plan, {passGachas: [], paidDailyLimit: 2, eventDailyLimit: 2, basis: '独立した架空の利用条件'} satisfies PlanBenefits]),
) as unknown as NonNullable<FixedSealBudgetDefinition['planBenefits']>;
/** Independent synthetic rates and costs; not derived from game records. */
export function sealDefinition():FixedSealBudgetDefinition {
 const base={draws:1,periodDays:1,memberProbabilityBp:2000,snapProbabilityBp:3000,otherProbabilityBp:5000,memberSeals:10,snapSeals:20,pointsPerDraw:2,sealsPerPoint:7,paidStarsPerDraw:0};
 return {version:2,revision:'test-1',planBenefits:fictionalPlanBenefits(),gachas:[{...base,id:'cm',name:'架空の日次抽選',draws:4},{...base,id:'pass',name:'架空の週次抽選',periodDays:7,memberProbabilityBp:0,snapProbabilityBp:0,otherProbabilityBp:10000,pointsPerDraw:0},{...base,id:'paid',name:'架空の有償抽選',paidStarsPerDraw:8},{...base,id:'event',name:'架空のイベント抽選',paidStarsPerDraw:8}],products:[{id:'fictional-paper',name:'架空の紙',tiers:[{sealCost:11,monthlyLimit:3},{sealCost:17,monthlyLimit:2}]}]};
}

import type {CollectionSealBudgetDefinition, SealCardRule, SealPool} from '../../src/domain/seal-budget/model';
import {syntheticCatalog, syntheticCollection} from './synthetic';
/** Invented four-card pools; same-rarity cards deliberately have unequal probabilities. */
export function collectionSealFixture() {
 const master = syntheticCatalog();
 master.members.push({...master.members[0]!, id: 8302, rarity: 2, name: '架空メンバー・折り紙'});
 master.snaps.push({...master.snaps[0]!, id: 8502, rarity: 2, name: '架空スナップ・紙舟'});
 master.memberLevelLimits.push(...master.memberLevelLimits.map(r => ({...r, rarity: 2})));
 const cards: SealCardRule[] = [
  {kind: 'member', cardId: 8302, completedAt: 2, beforeCompletion: {kind: 'pieces'}, afterCompletion: {kind: 'seals', amount: 10}},
  {kind: 'snap', cardId: 8502, completedAt: 2, beforeCompletion: {kind: 'pieces'}, afterCompletion: {kind: 'seals', amount: 20}},
  {kind: 'member', cardId: 8301, completedAt: 2, beforeCompletion: {kind: 'pieces'}, afterCompletion: {kind: 'seals', amount: 13}},
  {kind: 'snap', cardId: 8501, completedAt: 2, beforeCompletion: {kind: 'pieces'}, afterCompletion: {kind: 'seals', amount: 23}},
 ];
 const pool: SealPool = {id: 'ordinary', probabilityScale: 10000, otherProbability: 0,
  cards: cards.map((c, i) => ({kind: c.kind, cardId: c.cardId, probability: [2000, 3000, 1500, 3500][i]!}))};
 const featured: SealPool = {...pool, id: 'featured', probabilityScale: 1000000,
  cards: pool.cards.map((c, i) => ({...c, probability: [100001, 99999, 600000, 200000][i]!}))};
 const legacy = sealDefinition();
 const definition: CollectionSealBudgetDefinition = {version: 3, revision: master.revision, planBenefits: fictionalPlanBenefits(), cards, products: legacy.products,
  pools: [pool, featured, {id: 'empty', probabilityScale: 1, cards: [], otherProbability: 1}],
  gachas: legacy.gachas.map(({id, name, draws, periodDays, pointsPerDraw, sealsPerPoint, paidStarsPerDraw}) =>
   ({id, name, draws, periodDays, pointsPerDraw, sealsPerPoint, paidStarsPerDraw, poolId: id === 'pass' ? 'empty' : id === 'event' ? 'featured' : 'ordinary'}))};
 master.sealBudgetDefinition = definition;
 const collection = syntheticCollection(master);
 collection.members.push({...collection.members[0]!, cardId: 8302, awakeningStage: 2});
 collection.snaps.push({...collection.snaps[0]!, supportCardId: 8502, rank: 2});
 return {master, collection, definition};
}
