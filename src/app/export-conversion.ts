import { applyHypotheticalTraining } from './hypothetical-training';
import type { TrainingSettings } from './hypothetical-training';
import { catalogIssues, validateCatalog, catalogBase } from '../data/catalog/validate';
import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from '../storage/collection';
import type { Collection } from '../storage/collection';
import { estimateCharacterRanks } from '../domain/character-rank/estimate';
import { digest, importProfile, renderTemplate } from '../domain/conversion/profile';
import type { BoundRankRules } from '../domain/character-rank/rules';
import type { ConversionProfile } from '../domain/conversion/profile';

export interface ExportOptions { applyTraining: boolean; training: TrainingSettings }
export function prepareExport(master: Masterdata, value: Collection, options: ExportOptions, rules?:BoundRankRules) {
  const catalog = validateCatalog(master);
  if (catalogIssues(catalog).length || !catalog.characters.length) throw new Error('マスタに不足・不整合があります');
  const collection = validateCollection(value,catalog);
  if (collection.members.length + collection.snaps.length > 10000) throw new Error('出力できるカードは合計10000枚までです');
  const ranks = estimateCharacterRanks(catalog,collection,rules);
  if(ranks.some(r=>r.effectiveRank===null))throw new Error('ランクを出力できません。対応するランク定義を含むマスタをImportするか、手入力ランク・マスタを確認してください');
  if(ranks.some(r=>!catalog.characterRankLevels.includes(r.effectiveRank!))) throw new Error('出力するキャラクターランクが対応マスタの合法範囲にありません。マスタ・手入力ランクを確認してください');
  if(!Number.isSafeInteger(ranks.reduce((sum,r)=>sum+r.effectiveRank!,0)))throw new Error('総合ランクが大きすぎます');
  const missingItems = catalog.bandItems.filter(item=>!Object.hasOwn(collection.bandItems,item.id));
  if (missingItems.length) throw new Error(`バンドアイテムの所持状態が未入力です（${missingItems.length}件）。ランク・アイテムで確認してください`);
  const adjustments: {cardId:number; skill:string; before:number; after:number}[] = [];
  const projected = options.applyTraining ? applyHypotheticalTraining(catalog,collection,options.training) : collection;
  const members = projected.members.map((result,index)=>{
    const original=collection.members[index]!;
    for(const [key,label] of [['level','メンバーLv'],['trainingStage','特訓'],['awakeningStage','覚醒'],['liveSkillLevel','ライブ'],['gekisouSkillLevel','撃奏']] as const) {
      if(result[key]!==original[key]) adjustments.push({cardId:result.cardId,skill:label,before:original[key],after:result[key]});
    }
    const {cardId,level,trainingStage,awakeningStage,liveSkillLevel,gekisouSkillLevel} = result;
    return {cardId,level,trainingStage,awakeningStage,liveSkillLevel,gekisouSkillLevel};
  });
  // Estimate from the real collection above, before applying the shared training projection.
  return { data:{members,snaps:collection.snaps.map(s=>({...s})),ranks:ranks.map(r=>({id:r.id,value:r.effectiveRank!})),
    items:catalog.bandItems.map(i=>({id:i.id,level:collection.bandItems[i.id]!,owned:collection.bandItems[i.id] !== null}))},
    ranks,adjustments,tgwRank:collection.tgwRank ?? null,totalRank:ranks.reduce((sum,r)=>sum+r.effectiveRank!,0) };
}
export async function assertProfileCatalog(profile: ConversionProfile, master: Masterdata): Promise<void> {
  if (profile.catalog.catalogId !== master.catalogId || profile.catalog.revision !== master.revision || (profile.catalog.sha256 !== await digest(validateCatalog(master)) && profile.catalog.sha256 !== await digest(catalogBase(master)))) {
    throw new Error('マスタと変換プロファイルの版・内容が一致しません。対応するプロファイルをImportしてください');
  }
}
export async function exportConversion(master: Masterdata, collection: Collection, supplied: ConversionProfile, options: ExportOptions,
  context = {exportId:crypto.randomUUID() as string,at:Date.now()}, rules?:BoundRankRules) {
  // Revalidate at the boundary, including callers other than the UI.
  const profile = await importProfile(JSON.stringify(supplied));
  await assertProfileCatalog(profile,master);
  if (typeof options.applyTraining !== 'boolean') throw new Error('仮育成設定が不正です');
  if (!/^[A-Za-z0-9-]{1,100}$/.test(context.exportId) || !Number.isSafeInteger(context.at) || context.at < 0) throw new Error('Exportの識別情報が不正です');
  const preview = prepareExport(master,collection,options,rules);
  const value = renderTemplate(profile,preview.data,{...context,totalRank:preview.totalRank,tgwRank:preview.tgwRank});
  const text = JSON.stringify(value,null,2)+'\n';
  if (new TextEncoder().encode(text).length > 20_000_000) throw new Error('出力JSONが容量上限を超えています');
  return {text,preview};
}
