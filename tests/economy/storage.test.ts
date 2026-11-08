import {it,expect} from 'vitest';
import {economyFixture} from '../helpers/economy';
import {createEconomyStore,ECONOMY_STORAGE_KEY} from '../../src/storage/economy';
import type {StoragePort} from '../../src/storage/local';
it('loads without rewriting bytes; protects damaged storage until explicit recovery',()=>{
  const f=economyFixture(),map=new Map([[ECONOMY_STORAGE_KEY,'{"schemaVersion":99}']]);
  const storage:StoragePort={getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);}};
  const s=createEconomyStore(storage,f.scenario);expect(s.protected()).toBe(true);expect(s.original()).toBe('{"schemaVersion":99}');
  expect(()=>s.update(f.scenario)).toThrow('保護');expect(map.get(ECONOMY_STORAGE_KEY)).toBe('{"schemaVersion":99}');
  s.update(f.scenario,true,true);const raw=map.get(ECONOMY_STORAGE_KEY);const loaded=createEconomyStore(storage,f.scenario);
  expect(loaded.current()).toEqual(f.scenario);expect(map.get(ECONOMY_STORAGE_KEY)).toBe(raw);
});
it('retains valid conditions for export after save failure and keeps imports atomic',()=>{
  const f=economyFixture();const s=createEconomyStore({getItem:()=>null,setItem:()=>{throw new Error('quota');}},f.scenario);
  const next={...f.scenario,includeRankDaily:true};
  expect(s.update(next)).toBe(false);expect(s.current()).toEqual(next);expect(s.unsaved()).toBe(true);expect(s.message()).toContain('保存できません');
  expect(()=>s.update(f.scenario,true,true)).toThrow('保存できません');expect(s.current()).toEqual(next);
});
