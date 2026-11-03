import { expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { automaticFixture } from '../helpers/automatic-progress';
import { fictionalCatalog } from '../helpers/rank-rules';
import { automaticCharacterProgress } from '../../src/domain/character-rank/automatic-progress';
import { estimateCharacterRank } from '../../src/domain/character-rank/estimate';
import { estimateBondRankTheory } from '../../src/domain/character-rank/bond-theory';
import { importCatalog, exportCatalog } from '../../src/data/catalog/validate';
import { importCollection, exportCollection, validateCollection, emptyCollection } from '../../src/storage/collection';
import { prepareCollectionImport } from '../../src/storage/collection-import';
import { saveCollection, loadCollection } from '../../src/storage/local';
import { simulateTrainingEvaluation } from '../../src/app/training-simulation';
import { exportConversion } from '../../src/app/export-conversion';
import { fictionalProfile } from '../helpers/conversion';
import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';

it('counts unique owned stamp IDs for each target and zero for untargeted/all-off, without legacy fallback',async()=>{
  const {master,collection}=automaticFixture();
  collection.characterProgress={8201:{stamps:999,songClears:999}};
  expect(automaticCharacterProgress(master,collection,8201)).toEqual({songClears:8,stamps:0});
  collection.ownedStampIds=[9101,9102,9103];
  expect(automaticCharacterProgress(master,collection,8201)).toEqual({songClears:8,stamps:2});
  expect(automaticCharacterProgress(master,collection,8202)).toEqual({songClears:3,stamps:1});
  // Defensive calculation still never counts a repeated ownership ID twice.
  collection.ownedStampIds.push(9102);
  expect(automaticCharacterProgress(master,collection,8201).stamps).toBe(2);
  delete master.stamps;delete master.songClearCounts;
  expect(automaticCharacterProgress(master,collection,8201)).toEqual({songClears:0,stamps:0});
  collection.ownedStampIds=[];
  const withRules=await fictionalCatalog(master);
  expect(estimateCharacterRank(withRules,collection,8201).details.filter(d=>['stamps','songClears'].includes(d.definition.kind)).map(d=>d.value)).toEqual([0,0]);
  expect(estimateCharacterRank(master,collection,8201).estimatedRank).toBeNull();
});
it('round trips schema, storage and exports; omitted imports preserve stamps and explicit [] clears them',()=>{
  const {master,collection}=automaticFixture();collection.ownedStampIds=[9101,9102];
  const catalog=importCatalog(exportCatalog(master));
  expect(catalog).toEqual(master);
  expect(importCollection(exportCollection(collection,catalog),catalog)).toEqual(collection);
  const data=new Map<string,string>(),port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  expect(saveCollection(port,collection,master).status).toBe('saved');
  expect(loadCollection(port,master)).toEqual({status:'loaded',collection});
  const before=[...data];
  expect(saveCollection({...port,setItem:()=>{throw Error('quota');}},{...collection,ownedStampIds:[]},master).status).toBe('failed');
  expect([...data]).toEqual(before);
  expect(prepareCollectionImport(emptyCollection(master),collection,master).ownedStampIds).toEqual([9101,9102]);
  expect(prepareCollectionImport({...emptyCollection(master),ownedStampIds:[]},collection,master).ownedStampIds).toEqual([]);
  expect(emptyCollection(master).ownedStampIds??[]).toEqual([]);
  for(const [kind,value] of [['catalog',master],['collection',collection]] as const) {
    const schema=JSON.parse(readFileSync(`public/schemas/${kind}-v1.schema.json`,'utf8'));
    expect(new Ajv({strict:true}).compile(schema)(value)).toBe(true);
  }
});
it('keeps existing ownership on catalog updates, defaults additions OFF and rejects deleted references',()=>{
  const {master,collection}=automaticFixture();collection.ownedStampIds=[9102];
  const next=structuredClone(master);next.revision='fictional-next';next.stamps!.push({id:9104,name:'架空の新しい紙',characterIds:[8201]});
  expect(validateCollection(collection,next).ownedStampIds).toEqual([9102]);
  next.stamps=next.stamps!.filter(s=>s.id!==9102);
  expect(()=>validateCollection(collection,next)).toThrow('スタンプ');
  expect(()=>validateCollection(collection,{...master,catalogId:'unrelated'})).toThrow('異なり');
  expect(()=>validateCollection({...emptyCollection(master),ownedStampIds:[9102]}, {...master,catalogId:'unrelated'})).toThrow('異なり');
});
it('rejects malformed counts, stamp IDs, character references and owned stamp IDs',()=>{
  const {master,collection}=automaticFixture();
  for(const songClearCounts of [null,[],{8201:-1},{8201:1.5},{8201:Number.MAX_SAFE_INTEGER+1},{'08201':1},{9999:0}]) expect(()=>importCatalog(JSON.stringify({...master,songClearCounts}))).toThrow();
  for(const stamps of [null,{},[master.stamps![0],master.stamps![0]],[{id:1,name:'x',characterIds:[9999]}],[{id:1,name:'x',characterIds:[8201,8201]}],[{id:1,name:' ',characterIds:[]}],[{id:0,name:'x',characterIds:[]}]]) expect(()=>importCatalog(JSON.stringify({...master,stamps}))).toThrow();
  for(const ownedStampIds of [null,{},[9101,9101],[9999],[-1],[1.5],[Number.MAX_SAFE_INTEGER+1]]) expect(()=>validateCollection({...collection,ownedStampIds},master)).toThrow();
});
it('uses the same automatic counts in normal, bond theory and training paths without changing saved values',async()=>{
  const {master,collection}=automaticFixture();collection.ownedStampIds=[9101,9102];
  const m=await fictionalCatalog(master), before=JSON.stringify(collection);
  // member3 + two song rewards22 + one stamp reward7 =32 EXP => rank3.
  expect(estimateCharacterRank(m,collection,8201)).toMatchObject({exp:32,effectiveRank:3,missingProgress:['bondRankTotal','liveClears']});
  const theory=estimateBondRankTheory(m,collection,8101);
  expect(theory.status).toBe('ready');if(theory.status==='ready') expect(theory.characters[0]).toMatchObject({baseRank:3,finalRank:3});
  const simulation=simulateTrainingEvaluation(m,collection,DEFAULT_TRAINING);
  for (const ranks of [simulation.before.ranks,simulation.after.ranks]) {
    const detail=ranks.find(r=>r.id===8201)!.details;
    expect(detail.find(d=>d.definition.kind==='stamps')).toMatchObject({value:2,exp:7});
    expect(detail.find(d=>d.definition.kind==='songClears')).toMatchObject({value:8,exp:22});
  }
  const result=await exportConversion(m,collection,await fictionalProfile(m),{applyTraining:false,training:DEFAULT_TRAINING},{exportId:'fictional-auto',at:1234});
  expect(JSON.parse(result.text).ranks).toEqual({'8201':3,'8202':2});
  expect(JSON.stringify(collection)).toBe(before);
});
