import type { MaterialResource } from '../domain/materials/model';

export const RESOURCE_SECTIONS = [{unit:'item',title:'素材'},{unit:'card',title:'カード複製'},{unit:'exp',title:'EXP'}] as const;

/** Inventory section order, then metadata and stable catalog order within each section. */
export function resourcesForDisplay(resources: readonly MaterialResource[]): MaterialResource[] {
  return resources.map((resource,index)=>({resource,index})).sort((a,b)=>{
    const section=RESOURCE_SECTIONS.findIndex(s=>s.unit===a.resource.unit)-RESOURCE_SECTIONS.findIndex(s=>s.unit===b.resource.unit);
    if(section)return section;
    const x=a.resource.displayOrder,y=b.resource.displayOrder;
    if(x===undefined)return y===undefined?a.index-b.index:1;
    if(y===undefined)return -1;
    return x-y||a.index-b.index;
  }).map(row=>row.resource);
}
