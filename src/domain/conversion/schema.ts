const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const string={type:'string',minLength:1,maxLength:400};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const integer={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const ref=(name:string)=>({$ref:'#/$defs/'+name});
const map=(value:unknown)=>({type:'object',propertyNames:{minLength:1,maxLength:200,not:{enum:['__proto__','constructor','prototype']}},additionalProperties:value});
const array=(items:unknown,max=100)=>({type:'array',maxItems:max,items});
const template=(op:string,properties:Record<string,unknown>,required?:string[])=>object({op:{const:op},...properties},required?['op',...required]:undefined);
/** Structural subset. Path scopes, compatibility, budgets, checksums and binding also require runtime validation. */
export const conversionProfileSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://morimori36.github.io/atsudori-tools/schemas/conversion-profile-v2.schema.json',
  title:'atsudori-tools conversion profile v2',
  ...object({format:{const:'atsudori-tools/conversion-profile'},schemaVersion:{const:2},engine:{const:'bounded-template/1'},id:string,version:string,
    input:object({format:{const:'atsudori-tools/collection'},schemaVersion:{const:1}}),
    target:object({format:string,version:string,definitionSha256:hash}),
    catalog:object({catalogId:string,revision:string,sha256:hash}),
    provenance:object({sources:{...array(object({id:string,revision:string,sha256:hash}),20),minItems:1}}),
    program:ref('template'),output:ref('shape'),checksum:hash}),
  $defs:{
    json:{anyOf:[{type:'null'},{type:'boolean'},integer,{type:'string'},array(ref('json'),20000),map(ref('json'))]},
    template:{oneOf:[
      template('literal',{value:ref('json')}),template('get',{path:{...array(string,2),minItems:2}}),
      template('object',{fields:map(ref('template'))}),
      ...['array','concat','text'].map(op=>template(op,{values:array(ref('template'))})),
      template('map',{source:{enum:['members','snaps','ranks','items']},body:ref('template'),key:ref('template')},['source','body']),
      template('lookup',{values:map(ref('json')),key:ref('template')}),
      template('ifNull',{value:ref('template'),yes:ref('template'),no:ref('template')}),
    ]},
    shape:{oneOf:[
      object({type:{const:'object'},properties:map(ref('shape'))}),object({type:{const:'record'},values:ref('shape')}),
      object({type:{const:'array'},items:ref('shape'),max:{type:'integer',minimum:0,maximum:10000}}),
      object({type:{const:'choice'},options:{...array(ref('shape'),5),minItems:1}}),
      object({type:{const:'string'},decimal:{type:'boolean'},enum:{...array(string,20),minItems:1}},['type']),
      object({type:{const:'integer'},min:integer,max:integer}),object({type:{enum:['boolean','null']}}),
    ]},
  },
};
