import {it,expect} from 'vitest';
import {economyFixture} from '../helpers/economy';
import {validateCollection,importCollection,exportCollection} from '../../src/storage/collection';
import {prepareCollectionImport} from '../../src/storage/collection-import';
import {loadCollection,saveCollection,STORAGE_KEY} from '../../src/storage/local';
it('round trips minimal conditions through the existing collection without rewriting on load',()=>{
 const f=economyFixture();f.c.supplyConditions={lbPerDay:15,scoreRank:'Alto',studioLevels:[{bandId:8101,level:8}]};
 const map=new Map<string,string>(),storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 expect(saveCollection(storage,f.c,f.m).status).toBe('saved');const raw=map.get(STORAGE_KEY);
 expect(loadCollection(storage,f.m)).toMatchObject({status:'loaded',collection:f.c});expect(map.get(STORAGE_KEY)).toBe(raw);
 expect(importCollection(exportCollection(f.c,f.m),f.m)).toEqual(f.c);
});
it('preserves omitted conditions on daily imports and replaces explicit empty selections',()=>{
 const f=economyFixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];
 const incoming={...f.c};delete incoming.supplyConditions;
 expect(prepareCollectionImport(incoming,f.c,f.m).supplyConditions).toEqual(f.c.supplyConditions);
 expect(prepareCollectionImport(incoming,f.c,f.m,false).supplyConditions).toBeUndefined();
 incoming.supplyConditions={lbPerDay:0,scoreRank:null,studioLevels:[]};expect(prepareCollectionImport(incoming,f.c,f.m).supplyConditions).toEqual(incoming.supplyConditions);
});
it.each([{lbPerDay:-1,scoreRank:null,studioLevels:[]},{lbPerDay:1,scoreRank:null,studioLevels:[{bandId:1,level:0}]},{lbPerDay:0,scoreRank:null,studioLevels:[],rank:6}])('rejects invalid or duplicate shared state: %j',(supplyConditions)=>{
 const f=economyFixture();expect(()=>validateCollection({...f.c,supplyConditions},f.m)).toThrow();
});
it('protects damaged collection bytes and reports write failures',()=>{
 const f=economyFixture(),raw='{broken';const storage={getItem:()=>raw,setItem:()=>{throw Error('quota');}};
 expect(loadCollection(storage,f.m).status).toBe('invalid');expect(saveCollection(storage,f.c,f.m).status).toBe('failed');expect(storage.getItem()).toBe(raw);
});
it('matches the generated collection schema',async()=>{
 const f=economyFixture();const {default:Ajv}=await import('ajv/dist/2020');const {readFileSync}=await import('node:fs');
 const schema=new Ajv({strict:false}).compile(JSON.parse(readFileSync('public/schemas/collection-v1.schema.json','utf8')));
 expect(schema(f.c)).toBe(true);expect(schema({...f.c,supplyConditions:{...f.c.supplyConditions,skipPercent:0}})).toBe(false);
});
