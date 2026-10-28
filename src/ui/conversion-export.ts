import type { TrainingSettingsStore } from '../storage/training-settings';
import { trainingSettingsMarkup, bindTrainingSettings, preserveTrainingView } from './training-settings';
import { assertProfileCatalog, exportConversion, prepareExport } from '../app/export-conversion';
import type { ExportOptions } from '../app/export-conversion';
import { importProfile, PROFILE_LIMIT } from '../domain/conversion/profile';
import type { ConversionProfile } from '../domain/conversion/profile';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { saveJson } from '../storage/local';
import type { StoragePort } from '../storage/local';

export const PROFILE_STORAGE_KEY = 'atsudori-tools.conversion-profile.v2';
const escape = (v: unknown) => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const message = (e:unknown) => e instanceof Error ? e.message : '処理に失敗しました';
import type { BoundRankRules } from '../domain/character-rank/rules';
interface State { rules?:BoundRankRules; master: Masterdata; collection: Collection; protected: boolean }
export function createConversionExport(storage: StoragePort | undefined, read:()=>State, download:(text:string,name:string)=>void, trainingSettings:TrainingSettingsStore) {
  let host: HTMLElement | undefined;
  let profile: ConversionProfile | undefined;
  let original: string | undefined, loadMessage = '', notice = '', busy = false;
  let readId = 0, noticeError = false;
  let bindingKey='', bindingValid=false, bindingMessage='';
  const applyKey='atsudori-tools.conversion-training.v1';
  let applyTraining=false;
  try { applyTraining=storage?.getItem(applyKey)==='true'; } catch { /* Storage error is reported on update. */ }
  const options: ExportOptions = {applyTraining,training:trainingSettings.current()};
  const stamp = () => JSON.stringify([read(),options,trainingSettings.current(),profile?.checksum]);
  const describe = (p:ConversionProfile) => `<dl class="conversion-meta"><dt>プロファイル</dt><dd>${escape(p.id)} / ${escape(p.version)}</dd>
    <dt>出力形式</dt><dd>${escape(p.target.format)} / ${escape(p.target.version)}</dd>
    <dt>対応マスタ</dt><dd>${escape(p.catalog.catalogId)} / ${escape(p.catalog.revision)}</dd>
    <dt>定義ハッシュ</dt><dd>${escape(p.target.definitionSha256)}</dd></dl>`;
  // Loading is read-only. A later file selection invalidates this pending read.
  const initialRead = ++readId;
  void (async()=>{
    try {
      if (!storage) { loadMessage='このブラウザではプロファイルを保存できません'; return; }
      const raw = storage.getItem(PROFILE_STORAGE_KEY);
      if (raw === null) return;
      try { const value = await importProfile(raw); if(initialRead===readId) profile=value; }
      catch(e) { if(initialRead===readId) { original=raw; loadMessage='保存プロファイルを読み込めません。元JSONを保護しています。'+message(e); } }
    } catch(e) { if(initialRead===readId) loadMessage='プロファイル保存を利用できません。'+message(e); }
    finally { if(initialRead===readId) render(); }
  })();
  function render():void {
    if(!host?.isConnected) return;
    options.training=trainingSettings.current();
    const state=read();
    const key=profile?JSON.stringify([profile.checksum,state.master]):'';
    if(key!==bindingKey) {
      bindingKey=key;bindingValid=false;bindingMessage=profile?'プロファイルとマスタの整合性を検証中です':'';
      if(profile) void assertProfileCatalog(profile,state.master).then(()=>{
        if(key===bindingKey) {bindingValid=true;bindingMessage='';render();}
      }).catch(e=>{if(key===bindingKey) {bindingValid=false;bindingMessage=message(e);render();}});
    }
    let blocked='';
    try { if(state.protected) throw new Error('元のマスタ・所持JSONを保護中です。Import / Exportで復旧してから出力してください'); prepareExport(state.master,state.collection,options,state.rules); }
    catch(e) { blocked=message(e); }
    host.innerHTML=`<section class="exchange-section conversion-panel" aria-label="変換プロファイル"><h2>変換プロファイル</h2><span class="muted">${profile?'登録済み':'未登録'}</span>
      <div class="exchange-actions"><button class="primary" id="conversion-profile-select">Import / 更新</button><input hidden id="conversion-profile-file" type="file" accept=".json,application/json"><button class="secondary" id="conversion-profile-backup" ${profile?'':'disabled'}>Export</button></div>
      ${loadMessage?`<p role="alert" class="alert error">${escape(loadMessage)}</p>`:''}
      ${bindingMessage?`<p role="status" class="alert error">${escape(bindingMessage)}</p>`:''}
      <details><summary>詳細情報</summary>${profile?describe(profile):''}${original!==undefined?'<button class="secondary" id="conversion-profile-original">元のプロファイルJSONをダウンロード</button>':''}</details></section>
      <section class="exchange-section"><h2>外部形式JSON</h2>
      <button class="primary" id="conversion-preview" ${!profile||!bindingValid||blocked||busy?'disabled':''}>${busy?'処理中…':'JSON出力'}</button>
      ${blocked?`<p role="alert" class="alert error">${escape(blocked)}</p>`:''}
      <details><summary>仮育成設定</summary><label class="check"><input id="conversion-training" type="checkbox" ${options.applyTraining?'checked':''} ${busy?'disabled':''}>仮育成設定を適用する</label>${trainingSettingsMarkup(trainingSettings)}</details>
      </section>${notice?`<p class="alert ${noticeError?'error':'success'}" role="${noticeError?'alert':'status'}">${escape(notice)}</p>`:''}`;
    host.querySelector('#conversion-profile-select')?.addEventListener('click',()=>host?.querySelector<HTMLInputElement>('#conversion-profile-file')?.click());
    bindTrainingSettings(host,trainingSettings);
    host.querySelector<HTMLInputElement>('#conversion-profile-file')?.addEventListener('change',async event=>{
      const file=(event.target as HTMLInputElement).files?.[0]; if(!file) return;
      (event.target as HTMLInputElement).value='';
      const ticket=++readId, masterKey=JSON.stringify(read().master);  noticeError=false; notice='プロファイルを検証中…'; render();
      try {
        if(file.size>PROFILE_LIMIT) throw new Error('プロファイルは5MiBまでです');
        const candidate=await importProfile(await file.text());
        await assertProfileCatalog(candidate,read().master);
        if(ticket!==readId) return;
        if(masterKey!==JSON.stringify(read().master)) throw new Error('マスタが変わりました。選び直してください');
        const result=saveJson(storage,PROFILE_STORAGE_KEY,()=>JSON.stringify(candidate,null,2)+'\n');
        if(result.status==='failed') throw new Error('プロファイルを保存できません。'+result.error);
        profile=candidate; loadMessage=''; notice='プロファイルを更新しました';
      } catch(e) { if(ticket!==readId) return; noticeError=true; notice=message(e); }
      render();
    });
    host.querySelector('#conversion-profile-original')?.addEventListener('click',()=>download(original!,'atsudori-original-profile.json'));
    host.querySelector('#conversion-profile-backup')?.addEventListener('click',()=>download(JSON.stringify(profile,null,2)+'\n','atsudori-conversion-profile.json'));
    for(const [selector,key] of [['#conversion-training','applyTraining']] as const) {
      host.querySelector<HTMLInputElement>(selector)?.addEventListener('change',e=>{const value=(e.target as HTMLInputElement).checked; const result=saveJson(storage,applyKey,()=>JSON.stringify(value)); noticeError=result.status==='failed'; if(result.status==='saved') {options[key]=value;notice='設定を保存しました';} else {notice='設定を保存できません。'+result.error;} preserveTrainingView(host!,render);host?.querySelector<HTMLElement>(selector)?.focus();});
    }
    host.querySelector('#conversion-preview')?.addEventListener('click',async()=>{
      if(!profile||busy) return;
      options.training=trainingSettings.current();
      const before=stamp(), state=read(); busy=true; noticeError=false; notice=''; render();
      try {
        if(state.protected) throw new Error('元の保存JSONを復旧してください');
        const result=await exportConversion(state.master,state.collection,profile,options,undefined,state.rules);
        if(before!==stamp()) throw new Error('登録内容が変わりました。もう一度確認してください');
        download(result.text,'atsudori-converted.json'); notice='JSONを出力しました';
      } catch(e) { noticeError=true; notice=message(e); }
      finally { busy=false; render(); }
    });
  }
  trainingSettings.subscribe(()=>{notice='';if(host?.isConnected)preserveTrainingView(host,render);});
  return {mount(element:HTMLElement) { host=element;render(); }};
}
