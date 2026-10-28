import { describe, expect, it } from 'vitest';
import { emptyCollection, exportCollection, importCollection, validateCollection } from '../../src/storage/collection';
import { prepareCollectionImport } from '../../src/storage/collection-import';
import { loadCollection, saveCollection } from '../../src/storage/local';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { evaluateCollection } from '../../src/app/evaluate-collection';

describe('optional player TGW rank', () => {
  const master = syntheticCatalog();
  it('reads legacy v1 without inventing a rank and round-trips rank 1 independently of all other facts', () => {
    const legacy = syntheticCollection(master);
    expect(importCollection(exportCollection(legacy, master), master)).not.toHaveProperty('tgwRank');
    const ranked = { ...legacy, tgwRank: 1 };
    expect(importCollection(exportCollection(ranked, master), master)).toEqual(ranked);
    const { tgwRank, ...other } = validateCollection(ranked, master);
    expect(tgwRank).toBe(1); expect(other).toEqual(legacy);
    expect(evaluateCollection(master, ranked)).toEqual(evaluateCollection(master, legacy));
    const values = new Map<string,string>();
    const storage = { getItem:(k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>{values.set(k,v);} };
    expect(saveCollection(storage, ranked, master).status).toBe('saved');
    expect(loadCollection(storage, master)).toEqual({status:'loaded', collection:ranked});
  });
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,null,'1',true,NaN,Infinity])('rejects invalid rank %s', tgwRank => {
    expect(()=>validateCollection({...emptyCollection(master),tgwRank},master)).toThrow(/tgwRank/);
  });
  it('preserves omitted rank by default, permits full replacement and prioritizes explicit rank 1', () => {
    const current = {...syntheticCollection(master),tgwRank:7}, incoming = syntheticCollection(master);
    expect(prepareCollectionImport(incoming,current,master).tgwRank).toBe(7);
    expect(prepareCollectionImport(incoming,current,master,false)).not.toHaveProperty('tgwRank');
    expect(prepareCollectionImport({...incoming,tgwRank:1},current,master).tgwRank).toBe(1);
    expect(prepareCollectionImport(incoming,incoming,master)).not.toHaveProperty('tgwRank');
  });
});
