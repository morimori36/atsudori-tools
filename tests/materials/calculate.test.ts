import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { materialFixture } from '../helpers/materials';
import { calculateMaterialRequirements,calculateMaterialRequirementsToTarget } from '../../src/domain/materials/calculate';
import { maximumTrainingFixture } from '../helpers/maximum-training';
import { importCatalog,exportCatalog,catalogBase } from '../../src/data/catalog/validate';
import { loadCatalog,saveCatalog,loadCollection,CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { exportCollection } from '../../src/storage/collection';
describe('independent fictional material costs',()=>{
  it('imports by schema and semantics; separates axes, copies, EXP and unknown costs',()=>{
    const {m,c}=materialFixture();
    const ajv=new Ajv2020();expect(ajv.compile(JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8')))(m)).toBe(true);
    const before=JSON.stringify([m,c]);const r=calculateMaterialRequirements(importCatalog(exportCatalog(m)),c);
    expect(r.totals).toEqual([{resourceId:'copy',quantity:2},{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:31},{resourceId:'snap-exp',quantity:63}]);
    expect(r.cards[0]!.axes.map(a=>a.status)).toEqual(['calculated','calculated','calculated','unavailable','calculated']);
    expect(r.incomplete).toBe(true);expect(r.cards[0]!.axes[3]!.reason).toBe('費用の根拠未確認');expect(JSON.stringify([m,c])).toBe(before);
  });
  it('sums transition costs only above current; cumulative uses subtraction',()=>{
    const {m,c}=materialFixture();m.members[0]!.liveSkillLevels.push(4);
    m.materialDefinition!.schedules.find(s=>s.id==='live')!.stages.push({stage:4,amounts:[{resourceId:'paper',quantity:19}]});
    c.members[0]!.liveSkillLevel=2;
    const r=calculateMaterialRequirements(importCatalog(exportCatalog(m)),c);
    expect(r.cards[0]!.axes[2]).toMatchObject({current:2,target:4,amounts:[{resourceId:'paper',quantity:19}]});
    expect(r.totals.find(a=>a.resourceId==='paper')!.quantity).toBe(37);
    m.materialDefinition!.schedules.find(s=>s.id==='live')!.mode='cumulative';
    expect(calculateMaterialRequirements(m,c).cards[0]!.axes[2]!.amounts).toEqual([{resourceId:'paper',quantity:6}]);
  });
  it('calculates exact EXP from current to target cumulative levels without an upper estimate',()=>{
    const {m,c}=maximumTrainingFixture();
    c.snaps.forEach(s=>{s.level=2;});
    const target=structuredClone(c);
    target.members[0]!.trainingStage=2;target.members[0]!.level=2;
    target.snaps.forEach(s=>{s.rank=2;s.level=3;});
    const result=calculateMaterialRequirementsToTarget(m,c,target);
    expect(result.totals.filter(a=>a.resourceId.endsWith('-exp'))).toEqual([
      {resourceId:'member-exp',quantity:43}, // 60 - 17
      {resourceId:'snap-exp',quantity:240}, // (200 - 80) * 2
    ]);
    for(const card of result.cards){
      const level=card.axes.find(a=>a.axis==='level')!;
      expect(level.status).toBe('calculated');expect(level.reason).toBeUndefined();
    }
  });
  it('uses highest legal stage and its level cap; maximum costs nothing even without definitions',()=>{
    const {m,c}=materialFixture();c.members[0]={cardId:8301,trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2,level:2};c.snaps[0]={supportCardId:8501,rank:2,level:2};
    expect(calculateMaterialRequirements(m,c).totals).toEqual([]);
    delete m.materialDefinition;expect(calculateMaterialRequirements(m,c).cards.flatMap(c=>c.axes).every(a=>a.status==='complete')).toBe(true);
  });
  it('limits levels to the final legal cap even when the level group continues',()=>{
    const {m,c}=materialFixture();m.memberLevels.push({group:8401,level:3,rates:{performance:10000,technic:10000,visual:10000}});
    m.materialDefinition!.schedules.find(s=>s.id==='member-lv')!.stages.push({stage:3,amounts:[{resourceId:'member-exp',quantity:99}]});
    const r=calculateMaterialRequirements(importCatalog(exportCatalog(m)),c);
    expect(r.cards[0]!.axes[4]).toMatchObject({target:2,amounts:[{resourceId:'member-exp',quantity:43}]});
  });
  it('can mix explicit no-cost transitions and missing bindings without hiding the missing axis',()=>{
    const {m,c}=materialFixture();m.materialDefinition!.schedules[0]!.stages[1]!.amounts=[];m.materialDefinition!.bindings.splice(1,1);
    const r=calculateMaterialRequirements(importCatalog(exportCatalog(m)),c);
    expect(r.cards[0]!.axes[0]).toMatchObject({status:'calculated',amounts:[]});
    expect(r.cards[0]!.axes[1]!.status).toBe('unavailable');expect(r.incomplete).toBe(true);
  });
  it('does not report missing costs as zero',()=>{
    const {m,c}=materialFixture();delete m.materialDefinition;
    const r=calculateMaterialRequirements(m,c);expect(r.incomplete).toBe(true);expect(r.cards.flatMap(c=>c.axes).every(a=>a.status==='unavailable'&&a.reason)).toBe(true);
  });
  it.each(['revision','resource','stage','binding','decrease','reason','duplicate','axis'] as const)('rejects invalid %s',kind=>{
    const {m}=materialFixture(),d=m.materialDefinition!;
    if(kind==='revision')d.catalogRevision='different';if(kind==='resource')d.resources=[];
    if(kind==='stage')d.schedules[0]!.stages.pop();if(kind==='binding')d.bindings[0]!.cardId=999;
    if(kind==='decrease')d.schedules.find(s=>s.id==='member-lv')!.stages[1]!.amounts[0]!.quantity=1;
    if(kind==='reason')delete d.schedules[3]!.reason;if(kind==='duplicate')d.bindings.push(d.bindings[0]!);
    if(kind==='axis')d.bindings[0]!.axis='rank';
    expect(()=>importCatalog(JSON.stringify(m))).toThrow();
  });
  it('rejects unsafe aggregation',()=>{
    const {m,c}=materialFixture();m.materialDefinition!.schedules[0]!.stages[1]!.amounts[0]!.quantity=Number.MAX_SAFE_INTEGER;
    expect(()=>calculateMaterialRequirements(m,c)).toThrow(/安全な整数/);
  });
  it('preserves old collection bytes, base identity, legacy catalog and damaged storage',()=>{
    const {m,c}=materialFixture();const old={...m};delete old.materialDefinition;
    const raw=exportCollection(c,old),data=new Map([[STORAGE_KEY,raw],[CATALOG_STORAGE_KEY,exportCatalog(old)]]);
    const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
    expect(catalogBase(m)).toEqual(catalogBase(old));expect(loadCatalog(storage).status).toBe('loaded');expect(saveCatalog(storage,m).status).toBe('saved');expect(data.get(STORAGE_KEY)).toBe(raw);
    expect(loadCollection(storage,m).status).toBe('loaded');
    data.set(CATALOG_STORAGE_KEY,'damaged');expect(loadCatalog(storage).status).toBe('invalid');expect(data.get(CATALOG_STORAGE_KEY)).toBe('damaged');
    expect(saveCatalog({getItem:storage.getItem,setItem:()=>{throw Error('full');}},m).status).toBe('failed');expect(data.get(STORAGE_KEY)).toBe(raw);
  });
});
