import { it, expect } from 'vitest';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { fictionalRules } from '../helpers/rank-rules';
import { estimateCharacterRank, rankFromExp, totalCharacterRank } from '../../src/domain/character-rank/estimate';
import { bindRankRules } from '../../src/domain/character-rank/rules';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { potentialCollection } from '../../src/app/potential-collection';
import { importCollection, exportCollection, validateCollection } from '../../src/storage/collection';
import { loadCollection, saveCollection, STORAGE_KEY } from '../../src/storage/local';

it('keeps missing definitions unknown and manual overrides usable without estimation',()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);
  expect(estimateCharacterRank(m,c,8201)).toMatchObject({exp:null,estimatedRank:null,effectiveRank:3});
  expect(totalCharacterRank(m,c)).toBe(3);
  c.characterRanks={};
  expect(estimateCharacterRank(m,c,8201)).toMatchObject({exp:null,estimatedRank:null,effectiveRank:null,details:[]});
  expect(totalCharacterRank(m,c)).toBeNull();
  expect(evaluateCollection(m,c)[0]!.slots[0]!.status).toBe('pending');
});
it('counts owned cards and attributes shared supports to each appearing character',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.characterRanks={};
  m.characters.push({id:8202,bandId:8101,name:'架空奏者B'});m.members.push({...m.members[0]!,id:8302,characterId:8202});m.snaps[0]!.characterIds.push(8202);
  const rules=await bindRankRules(await fictionalRules(m),m);
  expect(estimateCharacterRank(m,c,8201,rules)).toMatchObject({exp:3,estimatedRank:1,effectiveRank:1});
  expect(estimateCharacterRank(m,c,8202,rules)).toMatchObject({exp:0,estimatedRank:1});
  c.snaps.push({...c.snaps[0]!,supportCardId:8504});m.snaps.push({...m.snaps[0]!,id:8504});
  const updated=await bindRankRules(await fictionalRules(m),m);
  expect(estimateCharacterRank(m,c,8202,updated).exp).toBe(5);
  expect(()=>estimateCharacterRank(m,c,9999,updated)).toThrow('未登録');
});
it('adds independent stage and skill counts, ignores legacy skill progress, and never mutates ownership',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.characterRanks={};
  Object.assign(c.members[0]!,{level:2,trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2});Object.assign(c.snaps[0]!,{level:2,rank:2});
  c.characterProgress={8201:{skillLevel2:83,skillLevel5:97}};
  const rules=await bindRankRules(await fictionalRules(m),m),before=JSON.stringify(c),r=estimateCharacterRank(m,c,8201,rules);
  // member3 + training19 + awakening23 + support-stage29 + skill thresholds(1,2)*31 =136.
  expect(r.exp).toBe(136);expect(r.estimatedRank).toBe(7);
  expect(r.details.find(d=>d.definition.kind==='skills')).toMatchObject({value:3,completed:2,exp:62});
  expect(JSON.stringify(c)).toBe(before);
});
it('uses explicit nonuniform count thresholds with caps and unknown/manual-zero distinction',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m),rules=await bindRankRules(await fictionalRules(m),m);
  expect(estimateCharacterRank(m,c,8201,rules).missingProgress).toHaveLength(4);
  for(const [n,award] of [[0,0],[2,7],[8,7],[9,14],[18,21]]) {
    c.characterProgress={8201:{stamps:n!}};
    expect(estimateCharacterRank(m,c,8201,rules).details.find(d=>d.definition.kind==='stamps')?.exp).toBe(award);
  }
  expect(estimateCharacterRank(m,c,8201,rules).effectiveRank).toBe(3);
});
it('uses imported cumulative EXP boundaries without assuming consecutive ranks',async()=>{
  const m=syntheticCatalog(),rules=await bindRankRules(await fictionalRules(m),m);
  for(const [exp,rank] of [[0,1],[6,1],[7,2],[18,2],[19,3],[40,3],[41,7],[999,7]])expect(rankFromExp(exp!,rules)).toBe(rank);
  for(const bad of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>rankFromExp(bad,rules)).toThrow();
});
it('uses the real-ownership rank for rating, total and hypothetical cultivation',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m);c.snaps=[];c.bandItems={8601:null};c.characterRanks={};
  const rules=await bindRankRules(await fictionalRules(m),m);
  // P/T/V65/171/321, h=.04, C50 => floor117/227/383 =727.
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.result?.bandRating).toBe(727);
  c.characterProgress={8201:{stamps:9}}; //3+14=17 EXP => rank2.
  expect(totalCharacterRank(m,c,rules)).toBe(2);
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.result?.bandRating).toBe(742);
  const before=JSON.stringify(c),p=potentialCollection(m,c);
  expect(evaluateCollection(m,p,c,rules)[0]!.slots[0]!.input?.characterRank).toBe(2);
  c.characterRanks[8201]=7;
  expect(totalCharacterRank(m,c,rules)).toBe(7);
  expect(evaluateCollection(m,c,c,rules)[0]!.slots[0]!.result?.bandRating).toBe(817);
  delete c.characterRanks[8201];expect(JSON.stringify(c)).toBe(before);
});
it('preserves old overrides and progress independently of definitions and available rank rows',()=>{
  const m=syntheticCatalog(),c={...syntheticCollection(m),characterRanks:{8201:83},characterProgress:{8201:{stamps:0,liveClears:88,skillLevel5:97}}};
  const bytes=exportCollection(c,m);expect(importCollection(bytes,m)).toEqual(c);
  const data=new Map<string,string>(),port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  expect(saveCollection(port,c,m).status).toBe('saved');expect(loadCollection(port,m)).toEqual({status:'loaded',collection:c});
  expect(estimateCharacterRank(m,c,8201)).toMatchObject({overrideRank:83,effectiveRank:null});
  const raw=data.get(STORAGE_KEY);c.characterProgress[8201]!.stamps=-1;
  expect(saveCollection(port,c,m).status).toBe('failed');expect(data.get(STORAGE_KEY)).toBe(raw);
});
it.each([-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null])('rejects invalid progress %s',value=>{
  const m=syntheticCatalog();expect(()=>validateCollection({...syntheticCollection(m),characterProgress:{8201:{stamps:value}}},m)).toThrow();
});
it('rejects unknown progress keys and broken character references without definitions',()=>{
  const m=syntheticCatalog();for(const progress of [{8201:{unknown:1}},{9999:{stamps:3}},{'08201':{stamps:3}}])expect(()=>validateCollection({...syntheticCollection(m),characterProgress:progress},m)).toThrow();
});
