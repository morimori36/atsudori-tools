import { expect,test } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { materialInventoryBalances,validateResourceInventory } from '../../src/domain/materials/inventory';
import { simulateTrainingEvaluation } from '../../src/app/training-simulation';
import { inventoryFixture,inventoryTraining } from '../helpers/inventory';
import { exportCollection,importCollection,validateCollection,emptyCollection } from '../../src/storage/collection';
import { prepareCollectionImport } from '../../src/storage/collection-import';
import { saveCollection,loadCollection,STORAGE_KEY,saveCatalog } from '../../src/storage/local';
import { importCatalog,exportCatalog } from '../../src/data/catalog/validate';

const schema=new Ajv2020().compile(JSON.parse(readFileSync('public/schemas/collection-v1.schema.json','utf8')));
test('shared resource stock is deducted once from global requirements, retaining per-kind costs',()=>{
  const {m,c}=inventoryFixture();c.resourceInventory={paper:30,copy:1};
  const saved=JSON.stringify([m,c,inventoryTraining]);
  const result=simulateTrainingEvaluation(m,c,inventoryTraining);
  const r=materialInventoryBalances(result.materials,c.resourceInventory);
  expect(result.materials.incomplete).toBe(false);
  expect(r.balances.find(r=>r.resource.id==='paper')).toMatchObject({required:41,stock:30,shortage:11,incomplete:false}); // member31 + Snap5*2, once minus30
  expect(r.balances.find(r=>r.resource.id==='copy')).toMatchObject({required:4,stock:1,shortage:3});
  expect(result.target.resourceInventory).toEqual(c.resourceInventory);
  expect(result.materials.cards.filter(r=>r.kind==='member').flatMap(r=>r.amounts).find(r=>r.resourceId==='paper')!.quantity).toBe(31);
  expect(JSON.stringify([m,c,inventoryTraining])).toBe(saved);
});
test.each([[undefined,null,null],[0,0,41],[30,30,11],[60,60,0],[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,0]] as const)('distinguishes unknown, zero and quantity %s', (n,stock,shortage)=>{
  const {m,c}=inventoryFixture();const requirements=simulateTrainingEvaluation(m,c,inventoryTraining).materials;
  const r=materialInventoryBalances(requirements,n===undefined?{}:{paper:n}).balances.find(r=>r.resource.id==='paper')!;
  expect(r.stock).toBe(stock);expect(r.shortage).toBe(shortage);
});
test('partial costs retain lower-bound semantics; EXP never acquires an inventory shortage',()=>{
  const {m,c}=inventoryFixture();
  const r=materialInventoryBalances(simulateTrainingEvaluation(m,c,{...inventoryTraining,gekisouSkillLevel:2}).materials,{paper:60,'member-exp':999});
  expect(r.balances.find(r=>r.resource.id==='paper')).toMatchObject({required:41,shortage:0,incomplete:true});
  expect(r.balances.find(r=>r.resource.id==='member-exp')).toMatchObject({required:43,stock:null,shortage:null});
  expect(r.unsupported).toEqual([{id:'member-exp',quantity:999,reason:expect.any(String)}]);
});
test('old v1 bytes remain unchanged; new optional inventory round-trips through schema, JSON and storage',()=>{
  const {m,c}=inventoryFixture();const raw=exportCollection(c,m);
  expect(schema(c)).toBe(true);expect(exportCollection(importCollection(raw,m),m)).toBe(raw);
  expect(importCollection(raw,m)).not.toHaveProperty('resourceInventory');
  c.resourceInventory={paper:0,copy:7,retired:11};expect(schema(c)).toBe(true);
  expect(importCollection(exportCollection(c,m),m)).toEqual(c);
  const data=new Map<string,string>(),port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  expect(saveCollection(port,c,m).status).toBe('saved');expect(loadCollection(port,m)).toEqual({status:'loaded',collection:c});
  const before=data.get(STORAGE_KEY);
  expect(saveCollection({getItem:port.getItem,setItem:()=>{throw Error('quota');}},{...c,resourceInventory:{paper:99}},m).status).toBe('failed');
  expect(data.get(STORAGE_KEY)).toBe(before);
});
test('daily imports preserve omitted inventory; explicit maps replace and empty map clears',()=>{
  const {m,c}=inventoryFixture();const previous={...c,resourceInventory:{paper:0,retired:11}};
  expect(prepareCollectionImport(c,previous,m).resourceInventory).toEqual(previous.resourceInventory);
  expect(prepareCollectionImport({...c,resourceInventory:{copy:2}},previous,m).resourceInventory).toEqual({copy:2});
  expect(prepareCollectionImport({...c,resourceInventory:{}},previous,m).resourceInventory).toEqual({});
  expect(prepareCollectionImport(c,previous,m,false)).not.toHaveProperty('resourceInventory');
});
test('renaming and removing resource definitions retain balances without mixing unknown IDs into requirements',()=>{
  const {m,c}=inventoryFixture();c.resourceInventory={paper:30,retired:11};
  const next=structuredClone(m);next.revision='test-2';next.materialDefinition!.catalogRevision=next.revision;
  next.materialDefinition!.resources.find(r=>r.id==='paper')!.name='架空の改名紙';next.materialDefinition!.resources=next.materialDefinition!.resources.filter(r=>r.id!=='retired');
  const master=importCatalog(exportCatalog(next));
  const data=new Map([[STORAGE_KEY,exportCollection(c,m)]]),port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  const before=data.get(STORAGE_KEY);expect(saveCatalog(port,master).status).toBe('saved');expect(data.get(STORAGE_KEY)).toBe(before);
  const collection=validateCollection(c,master);expect(collection.resourceInventory).toEqual(c.resourceInventory);
  const r=materialInventoryBalances(simulateTrainingEvaluation(master,collection,inventoryTraining).materials,collection.resourceInventory);
  expect(r.unsupported).toEqual([{id:'retired',quantity:11,reason:expect.any(String)}]);expect(r.balances.find(r=>r.resource.id==='paper')!.resource.name).toBe('架空の改名紙');
  expect(r.balances.some(r=>r.resource.id==='retired')).toBe(false);
  const only={...emptyCollection(m),resourceInventory:{retired:11},catalogId:'another-catalog'};
  expect(()=>validateCollection(only,m)).toThrow('catalogId');
});
test.each([-1,0.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'3',null,{},[]])('rejects invalid inventory value %s in schema or semantics',value=>{
  const {m,c}=inventoryFixture();const bad={...c,resourceInventory:{paper:value}};
  expect(schema(bad)).toBe(false);expect(()=>validateCollection(bad,m)).toThrow();
});
test.each([null,[],3,{'bad id':0},JSON.parse('{"constructor":1}'),Object.fromEntries(Array.from({length:20001},(_,i)=>['paper'+i,0]))])('rejects invalid inventory maps',value=>{
  expect(()=>validateResourceInventory(value)).toThrow();
  const {c}=inventoryFixture();expect(schema({...c,resourceInventory:value})).toBe(false);
});
test('prototype properties cannot masquerade as inventory quantities',()=>{
  const {m,c}=inventoryFixture();m.materialDefinition!.resources.push({id:'constructor',name:'架空の予約名',unit:'item'});
  const r=materialInventoryBalances(simulateTrainingEvaluation(m,c,inventoryTraining).materials).balances.find(r=>r.resource.id==='constructor')!;
  expect(r.stock).toBeNull();expect(r.shortage).toBeNull();
});
