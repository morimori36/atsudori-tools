import { jsonValue, strictObject, validateCatalog, catalogBase, catalogIssues, exportCatalog } from '../../data/catalog/validate';
import type { Masterdata } from '../../data/catalog/model';
import { digest } from '../conversion/profile';
import { validateRankDefinition, assertRankDefinitionCatalog } from './definition';
import type { RankDefinition } from './definitions';
export const RULES_LIMIT = 2 * 1024 * 1024;
/** Legacy standalone envelope, accepted only for explicit catalog migration. */
export interface RankRules extends RankDefinition {
  format: 'atsudori-tools/character-rank-rules'; schemaVersion: 1;
  catalog: {catalogId:string; revision:string; sha256:string};
}
export interface BoundRankRules {readonly document:RankDefinition; readonly catalogKey:string}
function fail():never {throw new Error('マスタの版・内容が一致しません。対応する定義をImportしてください');}
export function validateRankRules(value:unknown):RankRules {
  const required=['format','schemaVersion','engine','id','version','catalog','provenance','manualProgress','achievements','rankThresholds'];
  const root=strictObject(value,'$', [...required,'totalRankBonuses'],required);
  if(root.format!=='atsudori-tools/character-rank-rules'||root.schemaVersion!==1)throw new Error('未対応のランク定義形式です');
  const c=strictObject(root.catalog,'catalog',['catalogId','revision','sha256']);
  if([c.catalogId,c.revision].some(v=>typeof v!=='string'||!v.trim()||v.length>200)||typeof c.sha256!=='string'||!/^[a-f0-9]{64}$/.test(c.sha256))throw new Error('ランク定義のマスタ参照が不正です');
  const {format,schemaVersion,catalog,...payload}=root;
  return {...validateRankDefinition(payload),format:'atsudori-tools/character-rank-rules',schemaVersion:1,catalog:c as RankRules['catalog']};
}
export function parseRankRules(raw:string):RankRules {return validateRankRules(jsonValue(raw,RULES_LIMIT));}
export async function bindRankRules(value:RankRules,master:Masterdata):Promise<BoundRankRules & {readonly document:RankRules}> {
  const document=validateRankRules(value),catalog=validateCatalog(master);
  if(document.catalog.catalogId!==catalog.catalogId||document.catalog.revision!==catalog.revision||document.catalog.sha256!==await digest(catalogBase(catalog)))fail();
  assertRankDefinitionCatalog(document,catalog);
  const freeze=(v:object):void=>{for(const child of Object.values(v))if(child&&typeof child==='object')freeze(child as object);Object.freeze(v);};freeze(document);
  return Object.freeze({document,catalogKey:JSON.stringify(catalog)});
}
export function catalogRankRules(master:Masterdata):BoundRankRules|undefined {
  if(master.rankDefinition===undefined)return undefined;
  const catalog=validateCatalog(master);
  assertRankDefinitionCatalog(catalog.rankDefinition!,catalog);
  return {document:catalog.rankDefinition!,catalogKey:JSON.stringify(catalog)};
}
export async function mergeRankRules(master:Masterdata,value:RankRules):Promise<Masterdata> {
  const bound=await bindRankRules(value,master);
  const {format,schemaVersion,catalog,...rankDefinition}=bound.document;
  const next=validateCatalog({...master,rankDefinition});
  if(catalogIssues(next).length)throw new Error('マスタに不足・不整合があります');
  exportCatalog(next); // A merged catalog must remain reloadable under the catalog byte limit.
  return next;
}
export function assertRankRulesCatalog(bound:BoundRankRules,master:Masterdata):void {
  if(bound.catalogKey!==JSON.stringify(validateCatalog(master)))throw new Error('マスタの版・内容が変わりました。対応するマスタをImportしてください');
}
