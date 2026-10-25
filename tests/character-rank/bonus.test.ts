import {it,expect} from 'vitest';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {fictionalRules} from '../helpers/rank-rules';
import {bindRankRules,validateRankRules} from '../../src/domain/character-rank/rules';
import {resolveTotalRankBonus} from '../../src/domain/character-rank/bonus';
import {evaluateCollection} from '../../src/app/evaluate-collection';
import {potentialCollection} from '../../src/app/potential-collection';
import {exportCollection,importCollection} from '../../src/storage/collection';

it('uses imported thresholds across all current characters, even outside the selected band',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);delete c.totalRankBonus;
  m.bands.push({id:8102,name:'架空バンドB'});m.characters.push({id:8202,bandId:8102,name:'架空奏者B'});
  c.characterRanks[8202]=1;
  const doc=await fictionalRules(m);doc.totalRankBonuses=[{rank:0,bonus:13},{rank:5,bonus:29}];
  const rules=await bindRankRules(doc,m);
  const before=JSON.stringify(c);
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.input?.totalRankBonus).toBe(13);
  c.characterRanks[8202]=2;
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.input?.totalRankBonus).toBe(29);
  expect(evaluateCollection(m,potentialCollection(m,c),c,rules)[0]!.slots[0]!.input?.totalRankBonus).toBe(29);
  c.characterRanks[8202]=1;expect(JSON.stringify(c)).toBe(before);
});
it('keeps missing rules and incomplete ranks unknown rather than guessing a bonus',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);delete c.totalRankBonus;
  expect(evaluateCollection(m,c)[0]!.rating).toBeNull();
  const doc=await fictionalRules(m);delete doc.totalRankBonuses;
  expect(validateRankRules(doc).totalRankBonuses).toBeUndefined();
  const old=await bindRankRules(doc,m);
  expect(evaluateCollection(m,c,c,old)[0]!.rating).toBeNull();
  const rules=await bindRankRules(await fictionalRules(m),m);
  expect(resolveTotalRankBonus([{effectiveRank:3},{effectiveRank:null}],c,rules).bonus).toBeNull();
  expect(resolveTotalRankBonus([{effectiveRank:3}],c,{...rules,document:{...rules.document,totalRankBonuses:[{rank:9,bonus:13}]}}).bonus).toBeNull();
});
it('supports an explicit zero override and preserves it across JSON round trips',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.totalRankBonus=0;
  const copy=importCollection(exportCollection(c,m),m);
  expect(copy.totalRankBonus).toBe(0);
  expect(resolveTotalRankBonus([{effectiveRank:null}],copy).bonus).toBe(0);
  const rules=await bindRankRules(await fictionalRules(m),m);
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.input?.totalRankBonus).toBe(0);
});
it.each([-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,null,'1'])('rejects an invalid bonus override %s',n=>{
  const m=syntheticCatalog();expect(()=>importCollection(JSON.stringify({...syntheticCollection(m),totalRankBonus:n}),m)).toThrow();
});
it('rejects malformed, duplicate, unordered and decreasing bonus tables',async()=>{
  const doc=await fictionalRules();
  for(const rows of [[],[{rank:-1,bonus:13}],[{rank:0,bonus:1.5}],[{rank:4,bonus:13},{rank:4,bonus:29}],[{rank:4,bonus:13},{rank:2,bonus:29}],[{rank:0,bonus:29},{rank:4,bonus:13}]]) {
    expect(()=>validateRankRules({...doc,totalRankBonuses:rows})).toThrow();
  }
});
