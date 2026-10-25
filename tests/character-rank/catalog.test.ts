import {it,expect} from 'vitest';
import Ajv from 'ajv/dist/2020';
import {readFileSync} from 'node:fs';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {fictionalRules,fictionalCatalog} from '../helpers/rank-rules';
import {fictionalProfile} from '../helpers/conversion';
import {mergeRankRules} from '../../src/domain/character-rank/rules';
import {estimateCharacterRank} from '../../src/domain/character-rank/estimate';
import {evaluateCollection} from '../../src/app/evaluate-collection';
import {importCatalog,exportCatalog,validateCatalog,catalogIssues} from '../../src/data/catalog/validate';
import {exportCollection,importCollection} from '../../src/storage/collection';
import {assertProfileCatalog} from '../../src/app/export-conversion';

it('round trips one catalog containing ranks, progression and total-rank bonuses without the legacy envelope',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.characterRanks={};c.characterProgress={8201:{stamps:9}};
  const raw=exportCollection(c,m),legacy=await fictionalRules(m),before=JSON.stringify({m,c,legacy});
  const unified=await mergeRankRules(m,legacy),restored=importCatalog(exportCatalog(unified));
  expect(restored.rankDefinition).not.toHaveProperty('catalog');expect(restored.rankDefinition).not.toHaveProperty('format');
  expect(restored.rankDefinition?.totalRankBonuses).toEqual(legacy.totalRankBonuses);
  expect(estimateCharacterRank(restored,c,8201)).toMatchObject({effectiveRank:2,exp:17});
  expect(evaluateCollection(restored,c)[0]!.rating).toBe(840);
  expect(importCollection(raw,restored)).toEqual(c);expect(exportCollection(c,restored)).toBe(raw);
  expect(JSON.stringify({m,c,legacy})).toBe(before);
  const schema=JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8'));
  expect(new Ajv({strict:false}).compile(schema)(restored)).toBe(true);
});
it('retains legacy catalogs and manual-only operation without guessing definitions',()=>{
  const m=importCatalog(exportCatalog(syntheticCatalog()));
  expect(m.rankDefinition).toBeUndefined();expect(evaluateCollection(m,syntheticCollection(m))[0]!.rating).toBe(857);
});
it('rejects malformed embedded definitions and inconsistent catalog references',async()=>{
  const m=await fictionalCatalog();
  for(const bad of [null,{}, {...m.rankDefinition,engine:'eval/1'}, {...m.rankDefinition,catalog:{}}, {...m.rankDefinition,totalRankBonuses:[{rank:0,bonus:-1}]}]) {
    expect(()=>importCatalog(JSON.stringify({...m,rankDefinition:bad}))).toThrow();
  }
  m.characterRankLevels=[1];expect(catalogIssues(validateCatalog(m)).join(' ')).toContain('ランク');
  expect(()=>importCatalog(JSON.stringify(m))).toThrow();
});
it('does not accept a mismatched legacy catalog hash during migration',async()=>{
  const m=syntheticCatalog(),old=await fictionalRules(m);m.members[0]!.maxStats={...m.members[0]!.maxStats,performance:m.members[0]!.maxStats.performance+1};
  await expect(mergeRankRules(m,old)).rejects.toThrow('一致');
});
it('keeps legacy conversion profiles valid for unchanged base tables and pins new profiles to the full catalog',async()=>{
  const base=syntheticCatalog(),old=await fictionalProfile(base),unified=await fictionalCatalog(base);
  await expect(assertProfileCatalog(old,unified)).resolves.toBeUndefined();
  const current=await fictionalProfile(unified);
  const changed=structuredClone(unified);changed.rankDefinition!.version='changed';
  await expect(assertProfileCatalog(current,changed)).rejects.toThrow('一致');
  changed.members[0]!.maxStats={...changed.members[0]!.maxStats,performance:changed.members[0]!.maxStats.performance+1};
  await expect(assertProfileCatalog(old,changed)).rejects.toThrow('一致');
});
it('rejects an oversized combined/draft export before writing a catalog that cannot be reloaded',()=>{
  const m=syntheticCatalog();
  m.bands=Array.from({length:18000},(_,i)=>({id:8101+i,name:'架'.repeat(200)}));
  expect(()=>exportCatalog(m)).toThrow('10MiB');
});
