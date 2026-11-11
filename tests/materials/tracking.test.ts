import { expect,it } from 'vitest';
import { materialFixture } from '../helpers/materials';
import { calculateMaterialRequirements } from '../../src/domain/materials/calculate';
import { importCatalog,exportCatalog,validateCatalog } from '../../src/data/catalog/validate';
import { importCollection,exportCollection,validateCollection } from '../../src/storage/collection';
import { loadCollection,saveCollection,STORAGE_KEY,MATERIAL_INVENTORY_BACKUP_KEY } from '../../src/storage/local';
import { createResourceInventoryView } from '../../src/ui/resource-inventory';
import { calculateEconomy } from '../../src/domain/economy/calculate';
import { emptyEconomyScenario } from '../../src/domain/economy/validate';

function fixture(){
 const {m,c}=materialFixture();
 // Independently authored scope: a retired token and a retired duplicate, neither counted.
 m.materialDefinition!.excludedResourceIds=['retired-token','retired-copy'];
 c.resourceInventory={paper:5,'retired-token':91,'retired-copy':4,'unknown-backup':8};
 return {m,c};
}
it('omits retired inventories on import and export while retaining unknown IDs and ownership',()=>{
 const {m,c}=fixture(),before=JSON.stringify(c);
 const expected={paper:5,'unknown-backup':8};
 expect(validateCollection(c,m).resourceInventory).toEqual(expected);
 expect(importCollection(exportCollection(c,m),m).resourceInventory).toEqual(expected);
 expect(importCollection(exportCollection(c,m),m).members).toEqual(c.members);
 expect(JSON.stringify(c)).toBe(before);
 expect(()=>validateCollection({...c,resourceInventory:{'retired-token':-1}},m)).toThrow();
 expect(()=>validateCollection({...c,catalogId:'other'},m)).toThrow();
});
it('preserves original bytes on load and backs them up before the first pruning save',()=>{
 const {m,c}=fixture(),raw=JSON.stringify(c),data=new Map([[STORAGE_KEY,raw]]);
 const port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const loaded=loadCollection(port,m);expect(loaded.status).toBe('loaded');expect(data.size).toBe(1);expect(data.get(STORAGE_KEY)).toBe(raw);
 expect(saveCollection(port,c,m).status).toBe('saved');expect(data.get(MATERIAL_INVENTORY_BACKUP_KEY)).toBe(raw);
 expect(JSON.parse(data.get(STORAGE_KEY)!).resourceInventory).toEqual({paper:5,'unknown-backup':8});
 expect(saveCollection(port,{...c,resourceInventory:{paper:7}},m).status).toBe('saved');
 expect(data.get(MATERIAL_INVENTORY_BACKUP_KEY)).toBe(raw);
});
it('keeps the original when backup creation or final save fails',()=>{
 for(const failedKey of [STORAGE_KEY,MATERIAL_INVENTORY_BACKUP_KEY]){
  const {m,c}=fixture(),raw=JSON.stringify(c),data=new Map([[STORAGE_KEY,raw]]);
  const port={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(k===failedKey)throw Error('quota');data.set(k,v);}};
  expect(saveCollection(port,c,m).status).toBe('failed');expect(data.get(STORAGE_KEY)).toBe(raw);
 }
});
it('does not expose retired inventory in ordinary views or economy result export',()=>{
 const {m,c}=fixture(),html=createResourceInventoryView(m,c,{query:'',drafts:new Map()}).html;
 expect(html).not.toContain('retired-token');expect(html).not.toContain('retired-copy');expect(html).toContain('unknown-backup');
 const result=calculateEconomy(m,c.resourceInventory!,calculateMaterialRequirements(m,c),emptyEconomyScenario(m.catalogId));
 expect(JSON.stringify(result)).not.toContain('retired-token');expect(JSON.stringify(result)).not.toContain('retired-copy');
 expect(result.unsupportedInventory.map(x=>x.id)).toEqual(['unknown-backup']);
});
it('accepts explicitly empty costs as calculated, keeping progression and other costs',()=>{
 const {m,c}=fixture();const d=m.materialDefinition!;
 d.resources=d.resources.filter(r=>r.id!=='copy');d.excludedResourceIds!.push('copy');
 d.schedules.find(s=>s.id==='rank')!.stages.forEach(s=>s.amounts=[]);
 const result=calculateMaterialRequirements(importCatalog(exportCatalog(m)),c);
 expect(result.cards.find(c=>c.kind==='snap')!.axes.find(a=>a.axis==='rank')).toMatchObject({current:1,target:2,status:'calculated',amounts:[]});
 expect(result.totals.find(a=>a.resourceId==='paper')!.quantity).toBe(31); // 7+11+13, independently summed.
 expect(result.totals.some(a=>a.resourceId==='copy')).toBe(false);
});
it('rejects contradictory scope, unsupported version, and malformed excluded inventory',()=>{
 const {m}=fixture();m.materialDefinition!.excludedResourceIds!.push('paper');
 expect(()=>importCatalog(exportCatalog(m))).toThrow(/重複/);
 expect(()=>validateCatalog({...m,materialDefinition:{...m.materialDefinition,trackingVersion:2}})).toThrow();
 expect(()=>validateCatalog({...m,materialDefinition:{...m.materialDefinition,excludedResourceIds:['x','x']}})).toThrow();
});
it('blocks legacy catalog import and tracking while preserving saved catalog and inventory for migration',()=>{
 const {m,c}=fixture();delete m.materialDefinition!.trackingVersion;delete m.materialDefinition!.excludedResourceIds;
 expect(()=>importCatalog(exportCatalog(m))).toThrow(/追跡範囲/);
 expect(validateCatalog(m).materialDefinition!.resources.length).toBe(4);
 expect(calculateMaterialRequirements(m,c)).toMatchObject({cards:[],totals:[],resources:[],incomplete:true});
 const result=calculateEconomy(m,c.resourceInventory!,calculateMaterialRequirements(m,c),emptyEconomyScenario(m.catalogId));
 expect(result.rows).toEqual([]);expect(result.breakdown).toEqual([]);expect(result.unsupportedInventory).toEqual([]);
 expect(createResourceInventoryView(m,c,{query:'',drafts:new Map()}).html).not.toContain('retired-token');
 expect(()=>exportCollection(c,m)).toThrow(/追跡範囲/);
});
