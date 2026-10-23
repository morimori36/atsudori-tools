import { characterRankRulesSchema } from '../src/domain/character-rank/schema.ts';
import { storedProgressFields } from '../src/domain/character-rank/definitions.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tableFields } from '../src/data/catalog/fields.ts';
import { eventPlannerSchema } from '../src/domain/event-planner/schema.ts';
import { conversionProfileSchema } from '../src/domain/conversion/schema.ts';
const int = {type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const zero = {...int,minimum:0};
const text = {type:'string',minLength:1,maxLength:200,pattern:'\\S'};
const identity = {type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'};
const stats = {type:'object',additionalProperties:false,required:['performance','technic','visual'],properties:{performance:zero,technic:zero,visual:zero}};
const kinds = {integer:int,zeroInteger:zero,text,stats,ids:{type:'array',minItems:1,maxItems:10000,uniqueItems:true,items:int},pair:{type:'array',minItems:2,maxItems:2,items:int}};
const object = (properties:Record<string,unknown>,required=Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
const array = (items:unknown) => ({type:'array',maxItems:20000,items});
const catalog = {
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://morimori36.github.io/atsudori-tools/schemas/catalog-v1.schema.json',
  title:'atsudori-tools catalog v1',
  description:'Structural schema only. See docs/import-format.md for references, completeness, units and arithmetic constraints.',
  ...object({format:{const:'atsudori-tools/catalog'},schemaVersion:{const:1},catalogId:identity,revision:identity,
    ...Object.fromEntries(Object.entries(tableFields).map(([table,fields]) => [table,array(table==='characterRankLevels'?int:object(Object.fromEntries(Object.entries(fields).map(([key,kind])=>[key,kinds[kind]]))))]))})
};
const member=object({cardId:int,level:int,trainingStage:int,awakeningStage:int,liveSkillLevel:int,gekisouSkillLevel:int,displayedStatsOverride:stats},['cardId','level','trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel']);
const record=(value:unknown)=>({type:'object',propertyNames:{pattern:'^[1-9][0-9]*$'},additionalProperties:value});
const collection={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://morimori36.github.io/atsudori-tools/schemas/collection-v1.schema.json',
  title:'atsudori-tools collection v1',
  ...object({format:{const:'atsudori-tools/collection'},schemaVersion:{const:1},catalogId:identity,members:array(member),
    snaps:array(object({supportCardId:int,level:int,rank:int})),characterRanks:record(int),characterProgress:record(object(Object.fromEntries(Object.keys(storedProgressFields).map(key=>[key,zero])),[])),bandItems:record({anyOf:[int,{type:'null'}]})},['format','schemaVersion','catalogId','members','snaps','characterRanks','bandItems'])
};
writeFileSync('public/schemas/character-rank-rules-v1.schema.json',JSON.stringify(characterRankRulesSchema,null,2)+'\n');
mkdirSync('public/schemas',{recursive:true});
for (const [name,value] of [['catalog',catalog],['collection',collection],['event-planner',eventPlannerSchema]] as const)
  writeFileSync('public/schemas/' + name + '-v1.schema.json',JSON.stringify(value,null,2)+'\n');
writeFileSync('public/schemas/conversion-profile-v2.schema.json',JSON.stringify(conversionProfileSchema,null,2)+'\n');
