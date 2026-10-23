import { jsonValue, strictObject, validateCatalog } from '../../data/catalog/validate';
import type { Masterdata } from '../../data/catalog/model';
import { digest } from '../conversion/profile';
import { manualProgressKeys } from './definitions';
import type { AchievementDefinition, ManualProgressKey } from './definitions';
export const RULES_LIMIT = 2 * 1024 * 1024;
export interface RankRules {
  format: 'atsudori-tools/character-rank-rules'; schemaVersion: 1; engine: 'achievement-thresholds/1';
  id: string; version: string;
  catalog: {catalogId:string; revision:string; sha256:string};
  provenance: {sources:{id:string;revision:string;sha256:string}[]};
  manualProgress: {key:ManualProgressKey;label:string}[];
  achievements: AchievementDefinition[];
  rankThresholds: {rank:number;exp:number}[];
}
/** A validated definition bound to the exact catalog bytes; never serialized with the collection. */
export interface BoundRankRules {readonly document:RankRules; readonly catalogKey:string}
function fail(p:string,s:string):never {throw new Error(`ランク定義 ${p}: ${s}`);}
const obj=(v:unknown,p:string,keys:string[])=>strictObject(v,p,keys);
function text(v:unknown,p:string):string {if(typeof v!=='string'||!v.trim()||v.length>200)fail(p,'1〜200文字が必要です');return v;}
function integer(v:unknown,p:string,min=0):number {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min)fail(p,'安全な整数が必要です');return v;}
function rows(v:unknown,p:string,max=20000):unknown[] {if(!Array.isArray(v)||!v.length||v.length>max)fail(p,'空でない上限内の配列が必要です');return v;}
function hash(v:unknown,p:string):string {if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail(p,'SHA-256が必要です');return v;}
function unique(values:unknown[],p:string) {if(new Set(values).size!==values.length)fail(p,'重複しています');}
export function validateRankRules(value:unknown):RankRules {
  const r=obj(value,'$', ['format','schemaVersion','engine','id','version','catalog','provenance','manualProgress','achievements','rankThresholds']);
  if(r.format!=='atsudori-tools/character-rank-rules'||r.schemaVersion!==1||r.engine!=='achievement-thresholds/1')fail('$','未対応の形式・版・エンジンです');
  const c=obj(r.catalog,'catalog',['catalogId','revision','sha256']);
  const p=obj(r.provenance,'provenance',['sources']);
  const sources=rows(p.sources,'sources',100).map((v,i)=>{const s=obj(v,`sources[${i}]`,['id','revision','sha256']);return {id:text(s.id,'source.id'),revision:text(s.revision,'source.revision'),sha256:hash(s.sha256,'source.sha256')};});
  unique(sources.map(s=>s.id),'sources');
  const manualProgress=rows(r.manualProgress,'manualProgress',manualProgressKeys.length).map(v=>{
    const s=obj(v,'manualProgress',['key','label']);if(!manualProgressKeys.includes(s.key as ManualProgressKey))fail('manualProgress.key','未対応の進捗です');
    return {key:s.key as ManualProgressKey,label:text(s.label,'manualProgress.label')};});
  unique(manualProgress.map(s=>s.key),'manualProgress');
  let count=0,maxExp=0;
  const achievements=rows(r.achievements,'achievements',1000).map((v,i):AchievementDefinition=>{
    const path=`achievements[${i}]`,s=obj(v,path,['id','kind','label','stage','thresholds','exp']);
    const staged=['training','awakening','snapRank','skills'].includes(String(s.kind));
    if(!['members','snaps',...manualProgressKeys,'training','awakening','snapRank','skills'].includes(String(s.kind)))fail(path,'未対応の判定方法です');
    const stage=staged?integer(s.stage,path+'.stage',1):null;
    if(!staged&&s.stage!==null)fail(path,'この判定にstageは指定できません');
    const thresholds=rows(s.thresholds,path+'.thresholds',2000).map(v=>integer(v,path+'.thresholds',1));
    if((count+=thresholds.length)>20000||thresholds.some((v,j)=>j>0&&v<=thresholds[j-1]!))fail(path,'閾値は重複なく昇順で指定してください（全体20000件以内）');
    const exp=integer(s.exp,path+'.exp',1);maxExp+=thresholds.length*exp;
    if(!Number.isSafeInteger(maxExp))fail(path,'EXPの合計が大きすぎます');
    if(manualProgressKeys.includes(s.kind as ManualProgressKey)&&!manualProgress.some(p=>p.key===s.kind))fail(path,'手入力項目のラベルがありません');
    return {id:text(s.id,path+'.id'),kind:s.kind as AchievementDefinition['kind'],label:text(s.label,path+'.label'),stage,thresholds,exp};
  });
  unique(achievements.map(s=>s.id),'achievements.id');unique(achievements.map(s=>`${s.kind}:${s.stage}`),'achievements.kind/stage');
  if(manualProgress.some(p=>!achievements.some(a=>a.kind===p.key)))fail('manualProgress','対応する判定がありません');
  const rankThresholds=rows(r.rankThresholds,'rankThresholds',20000).map((v,i)=>{const s=obj(v,`rankThresholds[${i}]`,['rank','exp']);return {rank:integer(s.rank,'rank',1),exp:integer(s.exp,'exp')};});
  if(rankThresholds[0]!.exp!==0||rankThresholds.some((s,i)=>i>0&&(s.rank<=rankThresholds[i-1]!.rank||s.exp<=rankThresholds[i-1]!.exp)))fail('rankThresholds','最初のEXPは0、以後ランク・EXPとも重複なく昇順が必要です');
  return {format:'atsudori-tools/character-rank-rules',schemaVersion:1,engine:'achievement-thresholds/1',id:text(r.id,'id'),version:text(r.version,'version'),catalog:{catalogId:text(c.catalogId,'catalogId'),revision:text(c.revision,'revision'),sha256:hash(c.sha256,'catalog.sha256')},provenance:{sources},manualProgress,achievements,rankThresholds};
}
export function parseRankRules(raw:string):RankRules {return validateRankRules(jsonValue(raw,RULES_LIMIT));}
export async function bindRankRules(value:RankRules,master:Masterdata):Promise<BoundRankRules> {
  const document=validateRankRules(value),catalog=validateCatalog(master);
  if(document.catalog.catalogId!==catalog.catalogId||document.catalog.revision!==catalog.revision||document.catalog.sha256!==await digest(catalog))fail('catalog','マスタの版・内容が一致しません。対応する定義をImportしてください');
  if(document.rankThresholds.some(r=>!catalog.characterRankLevels.includes(r.rank)))fail('rankThresholds','マスタに対応するランクがありません');
  for(const a of document.achievements) {
    const stages=a.kind==='training'?catalog.memberTraining.map(s=>s.stage):a.kind==='awakening'?catalog.memberAwakening.map(s=>s.stage):a.kind==='snapRank'?catalog.snapRanks.map(s=>s.rank):a.kind==='skills'?[...catalog.members.flatMap(m=>[...m.liveSkillLevels,...m.gekisouSkillLevels]),...catalog.memberAwakening.map(s=>s.leaderSkillLevel)]:undefined;
    if(stages&&!stages.includes(a.stage!))fail('achievements','マスタに対応する段階がありません');
  }
  const freeze=(v:object):void=>{for(const child of Object.values(v))if(child&&typeof child==='object')freeze(child as object);Object.freeze(v);};freeze(document);
  return Object.freeze({document,catalogKey:JSON.stringify(catalog)});
}
export function assertRankRulesCatalog(bound:BoundRankRules,master:Masterdata):void {
  if(bound.catalogKey!==JSON.stringify(validateCatalog(master)))fail('catalog','マスタの版・内容が変わりました。対応する定義をImportしてください');
}
