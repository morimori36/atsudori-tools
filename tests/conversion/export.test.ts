import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';
import { describe, expect, it } from 'vitest';
import { exportConversion, prepareExport } from '../../src/app/export-conversion';
import { digest, importProfile } from '../../src/domain/conversion/profile';
import type { ConversionProfile } from '../../src/domain/conversion/profile';
import { fictionalRules } from '../helpers/rank-rules';
import { bindRankRules } from '../../src/domain/character-rank/rules';
import { fictionalProfile } from '../helpers/conversion';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';

const options={applyTraining:false,training:{...DEFAULT_TRAINING},complete:true};
const context={exportId:'fictional-export',at:1234};
const setup=()=>{const master=syntheticCatalog();master.members[0]!.liveSkillLevels=[1,2,3,4,5];master.members[0]!.gekisouSkillLevels=[1,2,3,4,5];return {master,collection:syntheticCollection(master)};};
async function reseal(profile: ConversionProfile):Promise<ConversionProfile> {const {checksum:_,...payload}=profile;return {...payload,checksum:await digest(payload)};}

describe('bounded profile export',()=>{
  it('converts validated ownership and preserves both input objects byte-for-byte',async()=>{
    const {master,collection}=setup(), profile=await fictionalProfile(master), before=JSON.stringify([master,collection,profile]);
    const result=await exportConversion(master,collection,profile,options,context);
    expect(JSON.parse(result.text)).toEqual({nonce:'fictional-export',time:1234,total:3,roster:[{id:8301,outLive:1,outGeki:1}],supports:[{id:8501,lv:1,stage:1}],ranks:{8201:3},items:{8601:1}});
    expect(JSON.stringify([master,collection,profile])).toBe(before);
  });
  it.each([[false,false,1,1],[true,false,4,1],[false,true,1,4],[true,true,4,4]])('separates both explicit training options (%s / %s)',async(liveSkill4,gekisouSkill4,live,geki)=>{
    const {master,collection}=setup(),profile=await fictionalProfile(master),before=JSON.stringify(collection);
    const result=await exportConversion(master,collection,profile,{...options,applyTraining:true,training:{...DEFAULT_TRAINING,trainingStage:null,liveSkillLevel:liveSkill4?4:null,gekisouSkillLevel:gekisouSkill4?4:null}},context);
    expect(JSON.parse(result.text).roster[0]).toEqual({id:8301,outLive:live,outGeki:geki});expect(JSON.stringify(collection)).toBe(before);
  });
  it('keeps higher levels and raises to the highest legal level below the target',()=>{
    const {master,collection}=setup();collection.members[0]!.liveSkillLevel=5;master.members[0]!.gekisouSkillLevels=[1,2];
    const p=prepareExport(master,collection,{...options,applyTraining:true,training:{...DEFAULT_TRAINING,trainingStage:null,liveSkillLevel:4,gekisouSkillLevel:4}});
    expect(p.data.members[0]).toMatchObject({liveSkillLevel:5,gekisouSkillLevel:2});expect(p.adjustments).toEqual([{cardId:8301,skill:'撃奏',before:1,after:2}]);
  });
  it('uses manual ranks first, estimates from real skills, and reports missing mission progress',async()=>{
    const {master,collection}=setup();delete collection.characterRanks['8201'];
    const profile=await fictionalProfile(master),rules=await bindRankRules(await fictionalRules(master),master);
    const a=await exportConversion(master,collection,profile,options,context,rules),b=await exportConversion(master,collection,profile,{...options,applyTraining:true,training:{...DEFAULT_TRAINING,trainingStage:null,liveSkillLevel:4,gekisouSkillLevel:4}},context,rules);
    expect(a.preview.ranks[0]).toMatchObject({effectiveRank:1,estimatedRank:1,missingProgress:expect.arrayContaining(['stamps','bondRankTotal','liveClears','songClears'])});
    expect(JSON.parse(a.text).ranks).toEqual(JSON.parse(b.text).ranks);
    collection.characterRanks['8201']=7;
    expect(prepareExport(master,collection,options,rules).ranks[0]).toMatchObject({effectiveRank:7,estimatedRank:1,overrideRank:7});
  });
  it('keeps absent items distinct from missing facts, and requires the ownership declaration',async()=>{
    const {master,collection}=setup(),p=await fictionalProfile(master);collection.bandItems['8601']=null;
    expect(JSON.parse((await exportConversion(master,collection,p,options,context)).text).items).toEqual({8601:'absent'});
    await expect(exportConversion(master,collection,p,{...options,complete:false},context)).rejects.toThrow('完全性');
    delete collection.bandItems['8601'];await expect(exportConversion(master,collection,p,options,context)).rejects.toThrow('未入力');
  });
  it('rejects changed master bytes even under the same ID and revision',async()=>{
    const {master,collection}=setup(),p=await fictionalProfile(master);master.members[0]!.maxStats={...master.members[0]!.maxStats,performance:102};
    await expect(exportConversion(master,collection,p,options,context)).rejects.toThrow('一致しません');
    master.revision='other';await expect(exportConversion(master,collection,p,options,context)).rejects.toThrow('一致しません');
  });
  it('rejects illegal values and unknown ownership keys at the boundary',async()=>{
    const {master,collection}=setup(),p=await fictionalProfile(master);collection.members[0]!.liveSkillLevel=6;
    await expect(exportConversion(master,collection,p,options,context)).rejects.toThrow('スキル');
    collection.members[0]!.liveSkillLevel=1;Object.assign(collection,{unexpected:true});
    await expect(exportConversion(master,collection,p,options,context)).rejects.toThrow('扱わない');
  });
  it.each(['schemaVersion','engine','input','target','extra','program','checksum'])('rejects unknown profile compatibility or structure: %s',async key=>{
    const p=await fictionalProfile();const bad=structuredClone(p) as unknown as Record<string,unknown>;
    const changes:Record<string,unknown>={schemaVersion:3,engine:'future/2',input:{format:'unknown',schemaVersion:1},target:{...p.target,unexpected:true},extra:true,program:{op:'execute',code:'throw 1'},checksum:'f'.repeat(64)};
    bad[key]=changes[key];await expect(importProfile(JSON.stringify(bad))).rejects.toThrow();
  });
  it('rejects dangerous keys, excess depth, nested loops and unknown input paths',async()=>{
    await expect(importProfile('{"__proto__":{}}')).rejects.toThrow('JSON');
    const p=await fictionalProfile();
    for(const program of [
      {op:'get',path:['row','level']}, {op:'get',path:['meta','password']},
      {op:'map',source:'members',body:{op:'map',source:'members',body:{op:'literal',value:1}}},
    ]) { await expect(importProfile(JSON.stringify(await reseal({...p,program} as ConversionProfile)))).rejects.toThrow(); }
    let node:unknown={op:'literal',value:1};for(let i=0;i<26;i++)node={op:'array',values:[node]};
    await expect(async()=>importProfile(JSON.stringify(await reseal({...p,program:node} as ConversionProfile)))).rejects.toThrow();
  });
  it('validates output shape, missing lookup bindings and duplicate record keys',async()=>{
    const {master,collection}=setup(),p=await fictionalProfile(master);
    await expect(exportConversion(master,collection,await reseal({...p,output:{type:'null'}}),options,context)).rejects.toThrow('出力定義');
    await expect(exportConversion(master,collection,await reseal({...p,program:{op:'lookup',values:{},key:{op:'literal',value:'missing'}}}),options,context)).rejects.toThrow('識別情報');
    master.characters.push({id:8202,bandId:8101,name:'別の架空奏者'});
    collection.characterRanks['8202']=3;
    const next=await fictionalProfile(master);
    await expect(exportConversion(master,collection,await reseal({...next,program:{op:'map',source:'ranks',key:{op:'literal',value:'same'},body:{op:'get',path:['row','value']}}}),options,context)).rejects.toThrow('処理上限');
  });
  it('supports declarative array concatenation and literal lookup without code execution',async()=>{
    const {master,collection}=setup(),p=await fictionalProfile(master);
    const program:ConversionProfile['program']={op:'concat',values:[{op:'array',values:[{op:'lookup',values:{fixture:'ok'},key:{op:'literal',value:'fixture'}}]},{op:'literal',value:[true,null]}]};
    const output:ConversionProfile['output']={type:'array',max:3,items:{type:'choice',options:[{type:'string'},{type:'boolean'},{type:'null'}]}};
    expect(JSON.parse((await exportConversion(master,collection,await reseal({...p,program,output}),options,context)).text)).toEqual(['ok',true,null]);
  });
  it('accepts independently named destination definitions without a provider or region allowlist',async()=>{
    const p=await fictionalProfile();
    const candidate=await reseal({...p,target:{format:'independent-report',version:'test-2026',definitionSha256:'c'.repeat(64)},
      provenance:{sources:[{id:'user-defined-contract',revision:'draft',sha256:'d'.repeat(64)}]}});
    expect(await importProfile(JSON.stringify(candidate))).toEqual(candidate);
  });
  it('rejects old profile versions and invalid or duplicate provenance instead of guessing',async()=>{
    const p=await fictionalProfile();
    for(const change of [{schemaVersion:1},{provenance:{sources:[]}},{provenance:{sources:[p.provenance.sources[0],p.provenance.sources[0]]}},
      {target:{...p.target,definitionSha256:'unknown'}}]) {
      await expect(importProfile(JSON.stringify(await reseal({...p,...change} as ConversionProfile)))).rejects.toThrow();
    }
  });
});

it('provides only nullable TGW metadata and keeps old profiles compatible',async()=>{
  const {master,collection}=setup(),old=await fictionalProfile(master);
  const profile=await reseal({...old,program:{op:'get',path:['meta','tgwRank']},output:{type:'choice',options:[{type:'null'},{type:'integer',min:1,max:Number.MAX_SAFE_INTEGER}]}});
  await expect(importProfile(JSON.stringify(profile))).resolves.toEqual(profile);
  expect(JSON.parse((await exportConversion(master,collection,profile,options,context)).text)).toBeNull();
  expect(JSON.parse((await exportConversion(master,{...collection,tgwRank:1},profile,options,context)).text)).toBe(1);
  expect((await exportConversion(master,{...collection,tgwRank:7},old,options,context)).text).toBe((await exportConversion(master,collection,old,options,context)).text);
  expect(prepareExport(master,{...collection,tgwRank:7},{...options,applyTraining:true}).tgwRank).toBe(7);
});
