const integer = {type:'integer',minimum:0,maximum:1e9};
const nullable = (value: unknown) => ({anyOf:[value,{type:'null'}]});
const id = {type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'};
const name = {type:'string',minLength:1,maxLength:200,pattern:'\\S'};
const object = (properties: Record<string,unknown>) => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const sealBudgetDefinitionSchema = object({version:{const:2},revision:id,
  gachas:{type:'array',minItems:4,maxItems:4,items:object({id:{enum:['cm','pass','paid','event']},name,draws:{...integer,minimum:1},periodDays:{type:'number',minimum:0.01,maximum:1e6},
    memberProbabilityBp:nullable({...integer,maximum:10000}),snapProbabilityBp:nullable({...integer,maximum:10000}),otherProbabilityBp:nullable({...integer,maximum:10000}),
    memberSeals:nullable(integer),snapSeals:nullable(integer),pointsPerDraw:nullable(integer),sealsPerPoint:nullable(integer),paidStarsPerDraw:nullable(integer)})},
  products:{type:'array',maxItems:200,items:object({id,name,tiers:{type:'array',minItems:1,maxItems:20,items:object({sealCost:nullable(integer),monthlyLimit:nullable(integer)})}})},
});
const scenario = object({cm:{type:'boolean'},pass:{type:'boolean'},paid:{enum:[0,1,2]},selectedProducts:{type:'array',maxItems:200,uniqueItems:true,items:id}});

export const sealBudgetScenarioSchema = {...scenario,required:['cm','pass','paid','selectedProducts'],properties:{...scenario.properties,event:{enum:[0,1,2]}}};
