import {it,expect} from 'vitest';
import {loadCatalog,saveCatalog,loadCollection,saveCollection,CATALOG_STORAGE_KEY,STORAGE_KEY} from '../../src/storage/local';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
const memory=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
it('stores catalog and collection independently without writing on load',()=>{
  const port=memory(),m=syntheticCatalog(),c=syntheticCollection(m);
  expect(loadCatalog(port).status).toBe('empty');expect(port.data.size).toBe(0);
  expect(saveCatalog(port,m).status).toBe('saved');expect(saveCollection(port,c,m).status).toBe('saved');
  const original=port.data.get(STORAGE_KEY);
  saveCatalog(port,{...m,revision:'test-2'});expect(port.data.get(STORAGE_KEY)).toBe(original);
  expect(loadCollection(port,m)).toEqual({status:'loaded',collection:c});
});
it.each([CATALOG_STORAGE_KEY,STORAGE_KEY])('preserves broken storage verbatim: %s',key=>{
  const port=memory();port.data.set(key,'{broken');
  const result=key===CATALOG_STORAGE_KEY?loadCatalog(port):loadCollection(port,syntheticCatalog());
  expect(result).toMatchObject({status:'invalid',raw:'{broken'});expect(port.data.get(key)).toBe('{broken');
});
it('reports unavailable storage and quota failures truthfully',()=>{
  const m=syntheticCatalog();expect(loadCatalog(undefined).status).toBe('unavailable');
  expect(saveCatalog(undefined,m).status).toBe('failed');
  const bad={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('quota');}};
  expect(loadCatalog(bad).status).toBe('unavailable');expect(saveCatalog(bad,m)).toMatchObject({status:'failed',error:'quota'});
});
it('validates before saving and retains existing bytes on invalid writes',()=>{
  const port=memory(),m=syntheticCatalog();saveCatalog(port,m);
  const raw=port.data.get(CATALOG_STORAGE_KEY);
  expect(saveCatalog(port,{...m,schemaVersion:2} as never).status).toBe('failed');expect(port.data.get(CATALOG_STORAGE_KEY)).toBe(raw);
});
