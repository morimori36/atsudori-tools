import { bindRankRules, parseRankRules, RULES_LIMIT } from '../domain/character-rank/rules';
import type { RankRules, BoundRankRules } from '../domain/character-rank/rules';
import type { Masterdata } from '../data/catalog/model';
import { loadJson, saveJson } from '../storage/local';
import type { StoragePort } from '../storage/local';
export const RANK_RULES_STORAGE_KEY='atsudori-tools.character-rank-rules.v1';
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const message=(e:unknown)=>e instanceof Error?e.message:'処理に失敗しました';
export function createRankRules(storage:StoragePort|undefined,read:()=>Masterdata,changed:()=>void,download:(text:string,name:string)=>void) {
  const loaded=loadJson(storage,RANK_RULES_STORAGE_KEY,parseRankRules);
  let document:RankRules|undefined=loaded.status==='loaded'?loaded.value:undefined;
  const original=loaded.status==='invalid'?loaded.raw:undefined;
  let notice=loaded.status==='invalid'?'保存ランク定義を読み込めません。元JSONを保護しています。'+loaded.error:loaded.status==='unavailable'?loaded.error:'';
  let bound:BoundRankRules|undefined,draft:BoundRankRules|undefined,host:HTMLElement|undefined;
  let stamp='',bindingError='',pending=false,saved=true,readId=0;
  function current():BoundRankRules|undefined {
    const master=read(),key=JSON.stringify(master);
    if(document&&stamp!==key) {
      stamp=key;bound=undefined;pending=true;bindingError='';const selected=document;
      void bindRankRules(selected,master).then(value=>{if(stamp===key&&document===selected)bound=value;})
        .catch(e=>{if(stamp===key&&document===selected)bindingError=message(e);})
        .finally(()=>{if(stamp===key&&document===selected){pending=false;render();changed();}});
    }
    return bound?.catalogKey===key?bound:undefined;
  }
  function render():void {
    if(!host?.isConnected)return;
    current();
    host.innerHTML=`<section class="panel"><h2>キャラクターランク定義</h2><p>推定と総合ランクボーナスの定義JSONを、マスタ・所持とは別にImportします。</p>
      ${document?`<dl class="conversion-meta"><dt>定義</dt><dd>${escape(document.id)} / ${escape(document.version)}</dd><dt>対応マスタ</dt><dd>${escape(document.catalog.catalogId)} / ${escape(document.catalog.revision)}</dd><dt>対応範囲</dt><dd>判定 ${document.achievements.length}件 / ランク ${document.rankThresholds[0]!.rank}〜${document.rankThresholds.at(-1)!.rank}</dd><dt>総合ランクボーナス表</dt><dd>${document.totalRankBonuses?document.totalRankBonuses.length+'件':'未登録（ボーナスは手入力が必要）'}</dd><dt>照合</dt><dd>${pending?'検証中':bound?'一致':'不一致'}</dd></dl><button class="secondary" id="rank-rules-export">定義JSONをExport</button>`:'<p>ランク定義未登録：自動推定には定義JSONのImportが必要です。手入力ランク・所持編集・バックアップは利用できます。</p>'}
      ${bindingError?`<p role="alert" class="alert error">${escape(bindingError)} 推定を停止しています。手入力値は保持します。</p>`:''}
      <label class="file-label" for="rank-rules-file">定義JSONを選択<input type="file" id="rank-rules-file" accept=".json,application/json"></label>
      ${draft?`<div class="import-preview"><p>${escape(draft.document.id)} / ${escape(draft.document.version)} · 対応マスタ ${escape(draft.document.catalog.revision)}</p><button class="primary" id="rank-rules-apply">確認して定義を更新</button></div>`:''}
      ${original?'<button class="secondary" id="rank-rules-original">元の定義JSONをExport</button>':''}
      ${notice?`<p role="status" class="alert">${escape(notice)}</p>`:''}${!saved?'<p role="alert">ブラウザ保存未完了です。定義JSONをExportしてください。</p>':''}</section>`;
    host.querySelector('#rank-rules-export')?.addEventListener('click',()=>download(JSON.stringify(document,null,2)+'\n','character-rank-rules.json'));
    host.querySelector('#rank-rules-original')?.addEventListener('click',()=>download(original!,'character-rank-rules-original.json'));
    host.querySelector<HTMLInputElement>('#rank-rules-file')?.addEventListener('change',async e=>{
      const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const ticket=++readId;draft=undefined;
      try {if(file.size>RULES_LIMIT)throw new Error('定義JSONは2MiB以内にしてください');const candidate=await bindRankRules(parseRankRules(await file.text()),read());if(ticket!==readId)return;draft=candidate;notice='版・内容を検証しました。確認して更新してください。';}
      catch(e){if(ticket!==readId)return;notice=message(e);}render();
    });
    host.querySelector('#rank-rules-apply')?.addEventListener('click',async()=>{
      if(!draft)return;const selected=draft;const ticket=++readId;
      try {
        const next=await bindRankRules(selected.document,read());if(ticket!==readId)return;
        if(next.catalogKey!==JSON.stringify(read()))throw new Error('マスタが変わりました。定義を選び直してください');
        const result=saveJson(storage,RANK_RULES_STORAGE_KEY,()=>JSON.stringify(next.document,null,2)+'\n');
        document=next.document;bound=next;stamp=next.catalogKey;draft=undefined;pending=false;bindingError='';saved=result.status==='saved';
        notice=saved?'ランク定義を更新しました。':'定義を保存できませんでした。'+(result.status==='failed'?result.error:'');
        render();changed();
      }catch(e){notice=message(e);render();}
    });
  }
  return {current,labels:()=>Object.fromEntries(current()?.document.manualProgress.map(p=>[p.key,p.label])??[]),mount(element:HTMLElement){host=element;render();}};
}
