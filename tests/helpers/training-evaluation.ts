import { maximumTrainingFixture } from './maximum-training';

/** Five invented paper players: four pair points award 3 EXP, repeatedly up to rank4. */
export function trainingEvaluationFixture() {
  const {m,c}=maximumTrainingFixture();
  m.characters.push(...[8203,8204,8205].map(id=>({id,bandId:8101,name:`架空の紙奏者${id}`})));
  m.rankDefinition!.achievements.find(a=>a.kind==='bondRankTotal')!.thresholds=[4,8,12,16];
  m.rankDefinition!.totalRankBonuses=[{rank:0,bonus:0},{rank:10,bonus:17}];
  return {m,c};
}
