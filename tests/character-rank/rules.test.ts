import { expect,it } from 'vitest';
import Ajv from 'ajv/dist/2020';
import { fictionalRules } from '../helpers/rank-rules';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { bindRankRules,parseRankRules,validateRankRules } from '../../src/domain/character-rank/rules';
import { characterRankRulesSchema } from '../../src/domain/character-rank/schema';
import { estimateCharacterRank } from '../../src/domain/character-rank/estimate';
import { exportConversion } from '../../src/app/export-conversion';
import { fictionalProfile } from '../helpers/conversion';
it('accepts a fictional document in the schema and binds it to the exact catalog',async()=>{
  const m=syntheticCatalog(),r=await fictionalRules(m),schema=new Ajv({strict:false}).compile(characterRankRulesSchema);
  expect(schema(r)).toBe(true);expect(parseRankRules(JSON.stringify(r))).toEqual(r);
  expect((await bindRankRules(r,m)).document).toEqual(r);
});
it.each(['format','engine','version','extra','duplicate','descending','zero','stage','reward','overflow','ranks','manual','source'])('rejects unsupported or unsafe definition: %s',async kind=>{
  const r=await fictionalRules(),b=r as unknown as Record<string,unknown>;
  if(kind==='format')b.schemaVersion=9;if(kind==='engine')b.engine='eval/1';if(kind==='version')b.version='';if(kind==='extra')b.script='code';
  if(kind==='duplicate')r.achievements.push(r.achievements[0]!);if(kind==='descending')r.achievements[0]!.thresholds=[8,3];if(kind==='zero')r.achievements[0]!.thresholds=[0];
  if(kind==='stage')r.achievements[0]!.stage=2;if(kind==='reward')r.achievements[0]!.exp=-1;if(kind==='overflow')r.achievements[0]!.exp=Number.MAX_SAFE_INTEGER;
  if(kind==='ranks')r.rankThresholds[1]!.exp=0;if(kind==='manual')r.manualProgress.push(r.manualProgress[0]!);if(kind==='source')r.provenance.sources.push(r.provenance.sources[0]!);
  expect(()=>validateRankRules(r)).toThrow();
});
it('rejects malformed and dangerous JSON, master version/content/stage/rank drift',async()=>{
  for(const raw of ['{','{"__proto__":{}}','null'])expect(()=>parseRankRules(raw)).toThrow();
  const m=syntheticCatalog(),r=await fictionalRules(m),bound=await bindRankRules(r,m);
  for(const change of [{revision:'future'},{catalogId:'other'},{characters:[...m.characters,{id:9999,bandId:8101,name:'Fiction'}]}])await expect(bindRankRules(r,{...m,...change})).rejects.toThrow('一致');
  m.members[0]!.maxStats={...m.members[0]!.maxStats,performance:102};expect(()=>estimateCharacterRank(m,syntheticCollection(m),8201,bound)).toThrow('変わりました');
  const n=syntheticCatalog(),bad=await fictionalRules(n);bad.rankThresholds.push({rank:83,exp:97});await expect(bindRankRules(bad,n)).rejects.toThrow('ランク');
  bad.rankThresholds.pop();bad.achievements.find(a=>a.kind==='training')!.stage=83;await expect(bindRankRules(bad,n)).rejects.toThrow('段階');
});
it('blocks profile export with missing definitions, retains manual-only operation, and ignores hypothetical progress',async()=>{
  const m=syntheticCatalog(),c=syntheticCollection(m),p=await fictionalProfile(m),options={complete:true,liveSkill4:false,gekisouSkill4:false},context={exportId:'fictional',at:1};
  expect((await exportConversion(m,c,p,options,context)).preview.totalRank).toBe(3);
  c.characterRanks={};const before=JSON.stringify(c);
  await expect(exportConversion(m,c,p,options,context)).rejects.toThrow('ランク定義');
  const rules=await bindRankRules(await fictionalRules(m),m);
  const a=await exportConversion(m,c,p,options,context,rules),b=await exportConversion(m,c,p,{...options,liveSkill4:true,gekisouSkill4:true},context,rules);
  expect(a.preview.totalRank).toBe(1);expect(b.preview.totalRank).toBe(1);expect(JSON.stringify(c)).toBe(before);
});
