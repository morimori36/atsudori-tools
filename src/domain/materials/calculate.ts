import type { Masterdata } from '../../data/catalog/model';
import { validateCollection } from '../../storage/collection';
import type { Collection } from '../../storage/collection';
import type { MaterialAmount, MaterialAxis, CardKind, MaterialResource } from './model';
import { axesFor, materialProgression, materialIssues } from './validate';
export interface AxisRequirement {
  axis: MaterialAxis; current: number; target: number | null;
  status: 'complete' | 'calculated' | 'bounded' | 'unavailable';
  amounts: MaterialAmount[]; reason?: string; basis?: string;
}
export interface CardRequirement { kind: CardKind; cardId: number; axes: AxisRequirement[]; amounts: MaterialAmount[] }
export interface MaterialRequirements { cards: CardRequirement[]; totals: MaterialAmount[]; resources: MaterialResource[]; incomplete: boolean }
function add(map:Map<string,number>,a:MaterialAmount):void {
  const sum=(map.get(a.resourceId)??0)+a.quantity;
  if(!Number.isSafeInteger(sum))throw new Error('必要素材の合計が安全な整数の範囲を超えます');
  if(sum)map.set(a.resourceId,sum);
}
const amounts=(map:Map<string,number>):MaterialAmount[]=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([resourceId,quantity])=>({resourceId,quantity}));
/** Uses real collection values only; hypothetical training is deliberately independent. */
export function calculateMaterialRequirements(m:Masterdata,input:Collection):MaterialRequirements {
  const issues=materialIssues(m);if(issues.length)throw new Error(issues.join('\n'));
  const c=validateCollection(input,m),d=m.materialDefinition;
  const schedules=new Map(d?.schedules.map(s=>[s.id,s]));
  const bindings=new Map(d?.bindings.map(b=>[`${b.kind}:${b.cardId}:${b.axis}`,b.scheduleId]));
  const totals=new Map<string,number>();
  const cards:CardRequirement[]=[];
  for(const kind of ['member','snap'] as const)for(const card of kind==='member'?c.members:c.snaps){
    const cardId='cardId' in card?card.cardId:card.supportCardId;
    const axes:AxisRequirement[]=[];const cardTotals=new Map<string,number>();
    for(const axis of axesFor(kind)){
      const current=(card as unknown as Record<string,number>)[axis]!;
      const progression=materialProgression(m,kind,cardId,axis);
      const target=progression?.target??null;
      const result:AxisRequirement={axis,current,target,status:'unavailable',amounts:[]};
      const schedule=schedules.get(bindings.get(`${kind}:${cardId}:${axis}`)??'');
      if(target===null)result.reason='合法的な最大段階を確定できません';
      else if(current>=target){result.status='complete';}
      else if(!schedule)result.reason='この育成項目の費用定義がありません';
      else if(schedule.mode==='unsupported')result.reason=schedule.reason;
      else{
        result.basis=schedule.basis;
        const sum=new Map<string,number>();
        if(schedule.mode==='steps'){
          for(const row of schedule.stages)if(row.stage>current&&row.stage<=target)for(const a of row.amounts)add(sum,a);
        }else{
          const from=schedule.stages.find(r=>r.stage===current)!,to=schedule.stages.find(r=>r.stage===target)!;
          for(const a of to.amounts)add(sum,{...a,quantity:a.quantity-(from.amounts.find(r=>r.resourceId===a.resourceId)?.quantity??0)});
        }
        result.amounts=amounts(sum);
        result.status=axis==='level'&&result.amounts.some(a=>d!.resources.find(r=>r.id===a.resourceId)?.unit==='exp')?'bounded':'calculated';
        if(result.status==='bounded')result.reason='現在Lvの開始時点からのEXP（上限）。Lv内の途中EXPが不明のため、実際の残り必要EXPは確定できません。EXPアイテム個数への換算は行いません。';
        for(const a of result.amounts){add(cardTotals,a);add(totals,a);}
      }
      axes.push(result);
    }
    cards.push({kind,cardId,axes,amounts:amounts(cardTotals)});
  }
  return {cards,totals:amounts(totals),resources:d?.resources??[],incomplete:cards.some(c=>c.axes.some(a=>a.status==='unavailable'))};
}
