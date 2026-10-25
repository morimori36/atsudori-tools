import { catalogRankRules, mergeRankRules, parseRankRules, RULES_LIMIT } from '../domain/character-rank/rules';
import type { RankRules, BoundRankRules } from '../domain/character-rank/rules';
import type { Masterdata } from '../data/catalog/model';
import { loadJson } from '../storage/local';
import type { StoragePort } from '../storage/local';
/** Read-only migration source. New definitions are saved only inside catalog. */
export const RANK_RULES_STORAGE_KEY='atsudori-tools.character-rank-rules.v1';
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const message=(e:unknown)=>e instanceof Error?e.message:'処理に失敗しました';
export function createRankRules(storage:StoragePort|undefined,read:()=>Masterdata,changed:()=>void,download:(text:string,name:string)=>void,replace:(master:Masterdata)=>boolean) {
  const loaded=loadJson(storage,RANK_RULES_STORAGE_KEY,parseRankRules);
  let original:string|undefined;
  try {original=storage?.getItem(RANK_RULES_STORAGE_KEY)??undefined;} catch {/* Read error is shown below. */}
  let notice=loaded.status==='invalid'?'旧保存ランク定義を読み込めません。元JSONを保護しています。'+loaded.error:loaded.status==='unavailable'?loaded.error:'';
  let host:HTMLElement|undefined,bound:BoundRankRules|undefined;
  let cacheKey='',migrationKey='',bindingError='',pending=false,readId=0;
  let draft:{document:RankRules;baseKey:string}|undefined;
  function current():BoundRankRules|undefined {
    const master=read(),key=JSON.stringify(master);
    if(key!==cacheKey) {
      bound=undefined;bindingError='';
      try {bound=catalogRankRules(master);}catch(e){bindingError=message(e);}
      cacheKey=key;
    }
    return bound;
  }
  function prepareSaved():void {
    const master=read(),key=JSON.stringify(master);
    if(master.rankDefinition||loaded.status!=='loaded'||migrationKey===key)return;
    migrationKey=key;pending=true;const ticket=++readId;
    void mergeRankRules(master,loaded.value).then(()=>{
      if(ticket!==readId||JSON.stringify(read())!==key)return;
      draft={document:loaded.value,baseKey:key};notice='旧保存定義を検証しました。確認するとcatalogへ統合します。元の保存JSONは保持します。';
    }).catch(e=>{if(ticket===readId)notice='旧保存定義の統合は保留しました。'+message(e);})
      .finally(()=>{if(ticket===readId){pending=false;render();}});
  }
  function render():void {
    if(!host?.isConnected)return;
    prepareSaved();current();
    const definition=read().rankDefinition;
    host.innerHTML=`<section class="panel"><h2>ランク定義（マスタに含む）</h2><p>達成条件・ランクEXP・総合ランクボーナス表はcatalogのrankDefinitionに保存します。マスタJSONをExportすればまとめてバックアップできます。</p>
      ${definition?`<dl class="conversion-meta"><dt>定義</dt><dd>${escape(definition.id)} / ${escape(definition.version)}</dd><dt>対応範囲</dt><dd>判定 ${definition.achievements.length}件 / ランク ${definition.rankThresholds[0]!.rank}〜${definition.rankThresholds.at(-1)!.rank}</dd><dt>総合ランクボーナス表</dt><dd>${definition.totalRankBonuses?definition.totalRankBonuses.length+'件':'未登録（ボーナスは手入力が必要）'}</dd></dl>`:'<p>ランク定義未登録：定義を含むマスタJSONをImportしてください。旧形式の定義は下の移行機能で統合できます。手入力ランクは利用できます。</p>'}
      ${bindingError?`<p role="alert" class="alert error">${escape(bindingError)} 推定を停止しています。</p>`:''}
      <details id="rank-rules-legacy" ${definition?'':'open'}><summary>旧形式のランク定義を統合</summary><p>旧catalogと一致する定義だけを検証して取り込みます。現在のランク定義がある場合は置き換わります。</p>
      <label class="file-label" for="rank-rules-file">旧ランク定義JSONを選択<input type="file" id="rank-rules-file" accept=".json,application/json"></label>
      ${pending?'<p>旧保存定義を検証中</p>':''}
      ${draft?`<div class="import-preview"><p>${escape(draft.document.id)} / ${escape(draft.document.version)}</p><button class="primary" id="rank-rules-apply">確認してcatalogへ統合・保存</button></div>`:''}
      ${original===undefined?'':'<button class="secondary" id="rank-rules-original">旧保存定義の元JSONをExport</button>'}</details>
      ${notice?`<p role="status" class="alert">${escape(notice)}</p>`:''}</section>`;
    host.querySelector('#rank-rules-original')?.addEventListener('click',()=>download(original!,'character-rank-rules-original.json'));
    host.querySelector<HTMLInputElement>('#rank-rules-file')?.addEventListener('change',async e=>{
      const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
      const ticket=++readId,master=read(),key=JSON.stringify(master);draft=undefined;pending=true;
      try {
        if(file.size>RULES_LIMIT)throw new Error('旧定義JSONは2MiB以内にしてください');
        const document=parseRankRules(await file.text());await mergeRankRules(master,document);
        if(ticket!==readId)return;
        if(key!==JSON.stringify(read()))throw new Error('マスタが変わりました。定義を選び直してください');
        draft={document,baseKey:key};notice='版・内容を検証しました。確認するとcatalogへ統合します。';
      }catch(e){if(ticket===readId)notice=message(e);}
      finally {if(ticket===readId){pending=false;render();}}
    });
    host.querySelector('#rank-rules-apply')?.addEventListener('click',async()=>{
      if(!draft)return;const selected=draft,ticket=++readId;
      try {
        if(selected.baseKey!==JSON.stringify(read()))throw new Error('マスタが変わりました。定義を選び直してください');
        const next=await mergeRankRules(read(),selected.document);
        if(ticket!==readId)return;
        if(selected.baseKey!==JSON.stringify(read()))throw new Error('マスタが変わりました。定義を選び直してください');
        const saved=replace(next);draft=undefined;
        notice=saved?'ランク定義をcatalogへ統合しました。':'catalogのブラウザ保存未完了です。マスタJSONをExportしてください。';
        changed();
      }catch(e){notice=message(e);render();}
    });
  }
  return {current,hasLegacy:()=>loaded.status==='loaded'||loaded.status==='invalid',
    labels:()=>Object.fromEntries(current()?.document.manualProgress.map(p=>[p.key,p.label])??[]),
    mount(element:HTMLElement){host=element;render();}};
}
