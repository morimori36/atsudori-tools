import { it,expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { economyFixture } from '../helpers/economy';
import { validateSupplyDefinition, validateEconomyScenario, importEconomyScenario, exportEconomyScenario } from '../../src/domain/economy/validate';
import { catalogBase, catalogIssues, exportCatalog, importCatalog } from '../../src/data/catalog/validate';
import { createEconomyStore, ECONOMY_STORAGE_KEY } from '../../src/storage/economy';
import type { StoragePort } from '../../src/storage/local';

it('round trips definitions and scenarios through structural schemas and semantic import',()=>{
  const f=economyFixture();const ajv=new Ajv2020({strict:false});
  const catalog=ajv.compile(JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8')));
  const scenario=ajv.compile(JSON.parse(readFileSync('public/schemas/economy-scenario-v1.schema.json','utf8')));
  expect(catalog(f.m),JSON.stringify(catalog.errors)).toBe(true);expect(scenario(f.scenario),JSON.stringify(scenario.errors)).toBe(true);
  expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);expect(importEconomyScenario(exportEconomyScenario(f.scenario))).toEqual(f.scenario);
  const before={...f.m};delete before.supplyDefinition;expect(catalogBase(f.m)).toEqual(catalogBase(before));expect(catalogIssues(before)).toEqual([]);
});
it.each(['catalogRevision','revision','currencies','lives','studios','ranks','events','offers','passes','unavailable'])('rejects missing definition field %s',key=>{
  const f=economyFixture();const raw={...f.supply} as Record<string,unknown>;delete raw[key];expect(()=>validateSupplyDefinition(raw)).toThrow();
});
it('rejects invalid ratios, lottery weights, duplicate costs, resets and invalid dates',()=>{
  const tests=[
    (f:ReturnType<typeof economyFixture>)=>{f.supply.ranks[0]!.studioMultiplier!.denominator=0;},
    (f:ReturnType<typeof economyFixture>)=>{f.supply.studios[0]!.rewards.lotteries[0]!.totalWeight=5;},
    (f:ReturnType<typeof economyFixture>)=>{f.supply.offers[0]!.costs.push(f.supply.offers[0]!.costs[0]!);},
    (f:ReturnType<typeof economyFixture>)=>{delete f.supply.offers[0]!.reset.weekday;},
    (f:ReturnType<typeof economyFixture>)=>{f.supply.events[0]!.endsAt='2024-02-30T00:00:00Z';},
    (f:ReturnType<typeof economyFixture>)=>{f.supply.lives[0]!.perLb.fixed[0]!.destination='direct';},
  ];for(const mutate of tests){const f=economyFixture();mutate(f);expect(()=>validateSupplyDefinition(f.supply)).toThrow();}
});
it('checks resource, band and catalog revision references',()=>{
  const f=economyFixture();f.supply.currencies.push('absent');f.supply.studios[0]!.bandId=1;f.supply.catalogRevision='other';
  expect(catalogIssues(f.m).length).toBeGreaterThanOrEqual(3);expect(()=>importCatalog(JSON.stringify(f.m))).toThrow();
});
it('rejects unknown fields, dangerous IDs and future scenario versions',()=>{
  const f=economyFixture();expect(()=>validateEconomyScenario({...f.scenario,extra:1})).toThrow();expect(()=>validateEconomyScenario({...f.scenario,schemaVersion:2})).toThrow();
  expect(()=>importEconomyScenario('{"__proto__":{}}')).toThrow();
  expect(()=>validateSupplyDefinition({...f.supply,currencies:['constructor']})).toThrow();
  expect(()=>validateEconomyScenario({...f.scenario,startDate:'2024-02-30'})).toThrow();
  expect(()=>validateEconomyScenario({...f.scenario,endDate:'2099-01-01'})).toThrow();
});
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
  const next={...f.scenario,endDate:'2024-01-02'};
  expect(s.update(next)).toBe(false);expect(s.current()).toEqual(next);expect(s.unsaved()).toBe(true);expect(s.message()).toContain('保存できません');
  expect(()=>s.update(f.scenario,true,true)).toThrow('保存できません');expect(s.current()).toEqual(next);
});
