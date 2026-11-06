import type { MaterialResource } from '../domain/materials/model';

/** Metadata first, then original catalog order for ties and resources without metadata. */
export function resourcesForDisplay(resources: readonly MaterialResource[]): MaterialResource[] {
  return resources.map((resource,index)=>({resource,index})).sort((a,b)=>{
    const x=a.resource.displayOrder,y=b.resource.displayOrder;
    if(x===undefined)return y===undefined?a.index-b.index:1;
    if(y===undefined)return -1;
    return x-y||a.index-b.index;
  }).map(row=>row.resource);
}
