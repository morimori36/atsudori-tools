import { manualProgressKeys } from './definitions.ts';
const int={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const zero={...int,minimum:0};
const text={type:'string',minLength:1,maxLength:200,pattern:'\\S'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const array=(items:unknown,maxItems=20000)=>({type:'array',minItems:1,maxItems,items});
export const characterRankRulesSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://morimori36.github.io/atsudori-tools/schemas/character-rank-rules-v1.schema.json',
  title:'Character rank rules v1',
  description:'Structural schema; ascending thresholds, uniqueness, arithmetic bounds and exact catalog binding are also validated by the application.',
  ...object({format:{const:'atsudori-tools/character-rank-rules'},schemaVersion:{const:1},engine:{const:'achievement-thresholds/1'},id:text,version:text,
    catalog:object({catalogId:text,revision:text,sha256:hash}),provenance:object({sources:array(object({id:text,revision:text,sha256:hash}),100)}),
    manualProgress:array(object({key:{enum:manualProgressKeys},label:text}),manualProgressKeys.length),
    achievements:array(object({id:text,kind:{enum:['members','snaps','training','awakening','snapRank','skills',...manualProgressKeys]},label:text,stage:{anyOf:[int,{type:'null'}]},thresholds:{...array(int,2000),uniqueItems:true},exp:int}),1000),
    rankThresholds:array(object({rank:int,exp:zero}))})
};
