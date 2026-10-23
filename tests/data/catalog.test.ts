import { describe,it,expect } from 'vitest';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { emptyCatalog,validateCatalog,importCatalog,exportCatalog,catalogIssues,jsonValue } from '../../src/data/catalog/validate';
import { importCollection,exportCollection,validateCollection,emptyCollection } from '../../src/storage/collection';
import { deriveMemberDisplay,deriveSnapDisplay,deriveBandItemRate } from '../../src/data/catalog/growth';
import { evaluateCollection,summarizeBands } from '../../src/app/evaluate-collection';
import { potentialCollection } from '../../src/app/potential-collection';
describe('catalog and collection',()=>{
  it('has an empty catalog with no game data or implied holdings',()=>{
    const m=emptyCatalog(); expect(m.members).toEqual([]); expect(m.bands).toEqual([]); expect(catalogIssues(m)).toEqual([]);
    expect(evaluateCollection(m,emptyCollection(m))).toEqual([]);
  });
  it('round trips independent formats',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);
    expect(importCatalog(exportCatalog(m))).toEqual(m);
    expect(importCollection(exportCollection(c,m),m)).toEqual(c);
    const next={...m,revision:'test-2'};
    expect(validateCollection(c,next)).toEqual(c);
  });
  it('derives each growth contribution separately',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);
    // P:50+10+5, T:121+40+10, V:214+92+15.
    expect(deriveMemberDisplay(m,c.members[0]!)).toEqual({displayedStats:{performance:65,technic:171,visual:321},awakeLevel:1,limitLevel:1});
    expect(deriveSnapDisplay(m,c.snaps[0]!)).toEqual({percentBp:{performance:160,technic:327,visual:493},snapLimitBreak:1,limitLevel:1});
    expect(deriveBandItemRate(m,8101,c.bandItems)).toEqual({status:'resolved',tenthPercent:13});
  });
  it('connects imported data through selection to 857, independently worked in docs/testing.md',()=>{
    const m=importCatalog(exportCatalog(syntheticCatalog())),c=importCollection(exportCollection(syntheticCollection(m),m),m);
    const colors=evaluateCollection(m,c); expect(colors[0]?.slots[0]?.result?.postMemberStats).toEqual({performance:129,technic:240,visual:398});
    expect(colors[0]?.rating).toBe(857); expect(summarizeBands(colors)[0]?.rating).toBe(857);
  });
  it('keeps maximum training a display-only projection',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m),raw=JSON.stringify(c),p=potentialCollection(m,c);
    expect(evaluateCollection(m,p)[0]?.rating).toBe(1214);
    expect(p.members[0]).toEqual({...c.members[0],trainingStage:2,level:2,liveSkillLevel:2,gekisouSkillLevel:2});
    expect(JSON.stringify(c)).toBe(raw); expect(p.snaps).toEqual(c.snaps);
  });
  it('preserves absent ranks/items as unknown, distinct from explicit unowned',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m); c.characterRanks={}; c.bandItems={};
    expect(evaluateCollection(m,c)[0]?.rating).toBeNull();
    expect(deriveBandItemRate(m,8101,{})).toEqual({status:'unresolved',missingItemIds:[8601]});
    expect(deriveBandItemRate(m,8101,{8601:null})).toEqual({status:'resolved',tenthPercent:0});
  });
  it('does not apply the retained legacy display override',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m); c.members[0]!.displayedStatsOverride={performance:0,technic:0,visual:0};
    expect(importCollection(exportCollection(c,m),m)).toEqual(c);
    expect(evaluateCollection(m,c)[0]?.rating).toBe(857);
  });
  it.each(['members','memberLevels','characterRankLevels','catalogId'])('rejects missing required %s',key=>{
    const m:Record<string,unknown>={...syntheticCatalog()}; delete m[key]; expect(()=>validateCatalog(m)).toThrow(key);
  });
  it.each(['{','null','[]','{"__proto__":{}}'])('rejects malformed or dangerous JSON %s',text=>{
    expect(()=>importCatalog(text)).toThrow();
  });
  it('rejects oversize UTF-8, even when string length is below byte budget',()=>{
    expect(()=>jsonValue('"あああ"',6)).toThrow('大きすぎ');
  });
  it('rejects future versions and unknown fields',()=>{
    expect(()=>validateCatalog({...syntheticCatalog(),schemaVersion:2})).toThrow('schemaVersion');
    expect(()=>validateCatalog({...syntheticCatalog(),secret:'x'})).toThrow('secret');
    expect(()=>validateCollection({...syntheticCollection(),schemaVersion:2},syntheticCatalog())).toThrow('schemaVersion');
  });
  it('rejects duplicate identities and compound growth keys',()=>{
    const m=syntheticCatalog();m.memberLevels.push(m.memberLevels[0]!);expect(()=>validateCatalog(m)).toThrow('重複');
  });
  it('accepts a manual draft but reports its exact missing references and rejects import',()=>{
    const m=syntheticCatalog();m.memberLevels=[];
    expect(validateCatalog(m).memberLevels).toEqual([]);
    expect(catalogIssues(m).join('\n')).toContain('members/8301');
    expect(()=>importCatalog(JSON.stringify(m))).toThrow('Lv率');
  });
  it('rejects dangling character references',()=>{
    const m=syntheticCatalog();m.characters=[];
    expect(()=>importCatalog(JSON.stringify(m))).toThrow('参照キャラクター');
  });
  it('rejects unsupported effect semantics and unrepresentable units',()=>{
    const m=syntheticCatalog();m.bandItemEffects[0]!.effectType=999;
    expect(()=>importCatalog(JSON.stringify(m))).toThrow('効果対象');
    m.bandItemEffects[0]!.effectType=1000;m.bandItemEffects[0]!.valueBp=1;
    expect(()=>importCatalog(JSON.stringify(m))).toThrow('0.1%');
  });
  it('rejects unsafe growth arithmetic before importing',()=>{
    const m=syntheticCatalog();m.members[0]!.maxStats={...m.members[0]!.maxStats,performance:Number.MAX_SAFE_INTEGER};
    expect(()=>importCatalog(JSON.stringify(m))).toThrow('数値範囲');
  });
  it.each([-1,0.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid numeric catalog field %s',n=>{
    const m=syntheticCatalog();m.members[0]!.maxStats={...m.members[0]!.maxStats,performance:n};expect(()=>validateCatalog(m)).toThrow('performance');
  });
  it('rejects mismatched namespaces without changing original data',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m),raw=JSON.stringify(c);
    expect(()=>validateCollection(c,{...m,catalogId:'other'})).toThrow('catalogId');expect(JSON.stringify(c)).toBe(raw);
  });
  it.each(['member','snap','rank','item','cap','skill'] as const)('rejects invalid collection %s',kind=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);
    if(kind==='member')c.members[0]!.cardId=99999;
    if(kind==='snap')c.snaps[0]!.rank=99;
    if(kind==='rank')c.characterRanks[8201]=-99;
    if(kind==='item')c.bandItems[8601]=0;
    if(kind==='cap')c.members[0]!.level=2;
    if(kind==='skill')c.members[0]!.liveSkillLevel=99;
    expect(()=>validateCollection(c,m)).toThrow();
  });
  it('rejects deleting a card referenced by collection',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);m.members=[];expect(()=>validateCollection(c,m)).toThrow('cardId');
  });
  it('rejects non-canonical record IDs and duplicate owned cards',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);c.characterRanks={'08201':3};expect(()=>validateCollection(c,m)).toThrow('正規');
    c.characterRanks={};c.members.push(c.members[0]!);expect(()=>validateCollection(c,m)).toThrow('重複');
  });
});
