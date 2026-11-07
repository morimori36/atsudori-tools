import type { MaterialRequirements } from './calculate';
import type { MaterialResource } from './model';

export type ResourceInventory=Record<string,number>;
export const resourceInventorySchema={type:'object',maxProperties:20000,
  propertyNames:{pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$',not:{enum:['__proto__','prototype','constructor']}},
  additionalProperties:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}};

/** Unknown IDs remain valid backup entries across catalog revisions. */
export function validateResourceInventory(value:unknown):ResourceInventory {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>20000)throw new Error('素材在庫は20000件以内のオブジェクトが必要です');
  return Object.fromEntries(Object.entries(value).map(([id,n])=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)||['__proto__','prototype','constructor'].includes(id))throw new Error('素材在庫のIDが不正です');
    if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw new Error('素材在庫は0以上の安全な整数が必要です');
    return [id,n];
  }));
}
export interface InventoryBalance {
  resource:MaterialResource; required:number; stock:number|null; shortage:number|null; incomplete:boolean;
}
/** Requirements are already summed by resourceId for the requested scope. Stock is applied once. */
export function materialInventoryBalances(requirements:MaterialRequirements,inventory:ResourceInventory={}) {
  const totals=new Map(requirements.totals.map(r=>[r.resourceId,r.quantity]));
  const balances:InventoryBalance[]=requirements.resources.map(resource=>{
    const required=totals.get(resource.id)??0;
    const stock=!Object.hasOwn(inventory,resource.id)?null:inventory[resource.id]!;
    return {resource,required,stock,shortage:stock===null?null:Math.max(required-stock,0),incomplete:requirements.incomplete};
  });
  const resources=new Map(requirements.resources.map(r=>[r.id,r]));
  const unsupported=Object.entries(inventory).flatMap(([id,quantity])=>{
    const resource=resources.get(id);
    return !resource?[{id,quantity,reason:'現在のマスタに対応する素材がありません。'}]:[];
  });
  return {balances,unsupported};
}
