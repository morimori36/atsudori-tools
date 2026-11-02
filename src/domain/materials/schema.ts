import { materialAxes } from './model.ts';
const int = {type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const text = {type:'string',minLength:1,maxLength:200,pattern:'\\S'};
const id = {type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'};
const object = (properties:Record<string,unknown>,required=Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
const array = (items:unknown,maxItems=20000) => ({type:'array',maxItems,items});
export const materialDefinitionSchema = object({
  catalogRevision:id,
  resources:array(object({id,name:text,unit:{enum:['item','card','exp']}})),
  schedules:array(object({id,axis:{enum:materialAxes},mode:{enum:['steps','cumulative','unsupported']},basis:text,reason:text,
    stages:array(object({stage:int,amounts:array(object({resourceId:id,quantity:{...int,minimum:0}}),100)}),1000)},['id','axis','mode','basis','stages'])),
  bindings:array(object({kind:{enum:['member','snap']},cardId:int,axis:{enum:materialAxes},scheduleId:id}))
});
