import { strictObject } from '../../data/json';
import type { Masterdata } from '../../data/catalog/model';
import { materialAxes } from './model';
import type { MaterialDefinition, MaterialAxis, CardKind } from './model';
const fail = (message:string):never => {throw new Error('materialDefinition: '+message);};
const id=(v:unknown):string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v)?v:fail('識別子が不正です');
const text=(v:unknown):string=>typeof v==='string'&&v.trim()&&v.length<=200?v:fail('説明は1〜200文字が必要です');
const integer=(v:unknown,min=1):number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min?v:fail('安全な整数が必要です');
const enumeration=<T extends string>(v:unknown,values:readonly T[]):T=>values.includes(v as T)?v as T:fail('未対応の区分です');
function rows(v:unknown,max=20000):unknown[]{if(!Array.isArray(v)||v.length>max)fail('配列の上限を超えています');return v as unknown[];}
function unique<T>(values:T[],key:(v:T)=>string):T[]{if(new Set(values.map(key)).size!==values.length)fail('キーが重複しています');return values;}
export function validateMaterialDefinition(value:unknown):MaterialDefinition {
  const r=strictObject(value,'materialDefinition',['catalogRevision','resources','schedules','bindings']);
  let count=0;
  return {catalogRevision:id(r.catalogRevision),
    resources:unique(rows(r.resources).map(v=>{const o=strictObject(v,'resource',['id','name','unit']);return {id:id(o.id),name:text(o.name),unit:enumeration(o.unit,['item','card','exp'])};}),v=>v.id),
    schedules:unique(rows(r.schedules).map(v=>{const o=strictObject(v,'schedule',['id','axis','mode','basis','reason','stages'],['id','axis','mode','basis','stages']);
      const stages=rows(o.stages,1000);count+=stages.length;if(count>50000)fail('段階は全体50000行以内です');
      return {id:id(o.id),axis:enumeration(o.axis,materialAxes),mode:enumeration(o.mode,['steps','cumulative','unsupported']),basis:text(o.basis),...(o.reason===undefined?{}:{reason:text(o.reason)}),
        stages:unique(stages.map(v=>{const s=strictObject(v,'stage',['stage','amounts']);return {stage:integer(s.stage),amounts:unique(rows(s.amounts,100).map(v=>{const a=strictObject(v,'amount',['resourceId','quantity']);return {resourceId:id(a.resourceId),quantity:integer(a.quantity,0)};}),a=>a.resourceId)};}),s=>String(s.stage))};}),v=>v.id),
    bindings:unique(rows(r.bindings).map(v=>{const o=strictObject(v,'binding',['kind','cardId','axis','scheduleId']);return {kind:enumeration(o.kind,['member','snap']),cardId:integer(o.cardId),axis:enumeration(o.axis,materialAxes),scheduleId:id(o.scheduleId)};}),v=>`${v.kind}:${v.cardId}:${v.axis}`)};
}
export const axesFor = (kind:CardKind):readonly MaterialAxis[] => kind==='member'?['trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel','level']:['rank','level'];
/** All defined stages; level target is the cap at the greatest legal training/rank stage. */
export function materialProgression(m:Masterdata,kind:CardKind,cardId:number,axis:MaterialAxis):{stages:number[];target:number}|undefined {
  if(!axesFor(kind).includes(axis))return;
  let stages:number[]=[],target:number|undefined;
  if(kind==='member'){
    const c=m.members.find(c=>c.id===cardId);if(!c)return;
    if(axis==='trainingStage')stages=m.memberTraining.filter(r=>r.group===c.trainingGroup).map(r=>r.stage);
    if(axis==='awakeningStage')stages=m.memberAwakening.filter(r=>r.group===c.awakeningGroup).map(r=>r.stage);
    if(axis==='liveSkillLevel')stages=c.liveSkillLevels;
    if(axis==='gekisouSkillLevel')stages=c.gekisouSkillLevels;
    if(axis==='level'){
      stages=m.memberLevels.filter(r=>r.group===c.levelGroup).map(r=>r.level);
      const training=Math.max(...m.memberTraining.filter(r=>r.group===c.trainingGroup).map(r=>r.stage));
      target=m.memberLevelLimits.find(r=>r.rarity===c.rarity&&r.trainingStage===training)?.limitLevel;
      if(target===undefined)return;
    }
  }else{
    const c=m.snaps.find(c=>c.id===cardId);if(!c)return;
    if(axis==='rank')stages=m.snapRanks.filter(r=>r.group===c.rankGroup).map(r=>r.rank);
    if(axis==='level'){
      stages=m.snapLevels.filter(r=>r.group===c.levelGroup).map(r=>r.level);
      const ranks=m.snapRanks.filter(r=>r.group===c.rankGroup).sort((a,b)=>a.rank-b.rank);
      target=ranks.at(-1)?.limitLevel;if(target===undefined)return;
    }
  }
  if(!stages.length)return;
  return {stages:[...stages].sort((a,b)=>a-b),target:target??Math.max(...stages)};
}
export function materialIssues(m:Masterdata):string[]{
  const d=m.materialDefinition;if(!d)return [];
  const issues:string[]=[];const need=(ok:boolean,message:string)=>{if(!ok&&issues.length<100)issues.push('materialDefinition: '+message);};
  need(d.catalogRevision===m.revision,'catalogの版が一致しません');
  const resources=new Map(d.resources.map(r=>[r.id,r]));const schedules=new Map(d.schedules.map(s=>[s.id,s]));
  for(const s of d.schedules){
    need(s.mode!=='unsupported'||Boolean(s.reason),'未対応の理由がありません');
    need(s.mode==='unsupported'?s.stages.length===0:s.stages.length>0,'費用の段階定義が不正です');
    const ordered=[...s.stages].sort((a,b)=>a.stage-b.stage);
    for(const [i,row] of ordered.entries()){
      for(const a of row.amounts){
        need(resources.has(a.resourceId),'素材参照がありません');
        if(resources.get(a.resourceId)?.unit==='exp')need(s.mode==='cumulative'&&s.axis==='level','EXPはLvの累計要求量だけに対応します');
      }
      if(s.mode==='steps'&&i===0)need(row.amounts.every(a=>a.quantity===0),'初期段階の消費は0である必要があります');
      if(s.mode==='cumulative'&&i>0){
        const previous=new Map(ordered[i-1]!.amounts.map(a=>[a.resourceId,a.quantity]));const current=new Map(row.amounts.map(a=>[a.resourceId,a.quantity]));
        for(const [id,n] of previous)need((current.get(id)??0)>=n,'累計要求量が減少しています');
      }
    }
  }
  for(const b of d.bindings){
    const p=materialProgression(m,b.kind,b.cardId,b.axis);const s=schedules.get(b.scheduleId);
    need(Boolean(p),'カードまたは育成軸の参照が不正です');need(Boolean(s)&&s?.axis===b.axis,'費用定義または育成軸が一致しません');
    if(p&&s&&s.mode!=='unsupported'){
      need(p.stages.every(n=>s.stages.some(r=>r.stage===n)),'合法段階の費用行がありません');
      need(s.stages.every(r=>p.stages.includes(r.stage)),'未定義の段階を含みます');
    }
  }
  return issues;
}
