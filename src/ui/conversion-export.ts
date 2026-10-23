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
export function createConversionExport(storage: StoragePort | undefined, read:()=>State, download:(text:string,name:string)=>void) {
  let host: HTMLElement | undefined;
  let profile: ConversionProfile | undefined, draft: ConversionProfile | undefined;
  let original: string | undefined, loadMessage = '', notice = '', saved = true, busy = false;
  let readId = 0, preview: Awaited<ReturnType<typeof exportConversion>> | undefined, previewStamp = '';
  let bindingKey='', bindingValid=false, bindingMessage='';
  const options: ExportOptions = {liveSkill4:false,gekisouSkill4:false,complete:false};
  const stamp = () => JSON.stringify([read(),options,profile?.checksum]);
  const invalidate = () => { preview = undefined; previewStamp = ''; };
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
    const state=read();
    const key=profile?JSON.stringify([profile.checksum,state.master]):'';
    if(key!==bindingKey) {
      bindingKey=key;bindingValid=false;bindingMessage=profile?'プロファイルとマスタの整合性を検証中です':'';
      if(profile) void assertProfileCatalog(profile,state.master).then(()=>{
        if(key===bindingKey) {bindingValid=true;bindingMessage='';render();}
      }).catch(e=>{if(key===bindingKey) {bindingValid=false;bindingMessage=message(e);invalidate();render();}});
    }
    let summary: ReturnType<typeof prepareExport> | undefined, blocked='';
    try { if(state.protected) throw new Error('元のマスタ・所持JSONを保護中です。Import / Exportで復旧してから出力してください'); summary=prepareExport(state.master,state.collection,options,state.rules); }
    catch(e) { blocked=message(e); }
    const estimated=summary?.ranks.filter(r=>r.overrideRank===undefined) ?? [];
    const limited=estimated.filter(r=>r.missingProgress.length);
    host.innerHTML=`<section class="panel conversion-panel" aria-label="プロファイルでJSON出力"><h2>プロファイルでJSON出力</h2>
      <p>登録した変換プロファイルの定義で、所持・育成情報をJSONへ出力します。</p>
      <details ${profile?'':'open'}><summary>変換プロファイルのImport・更新</summary>
        <p>対応マスタと一緒に用意した、信頼できる変換プロファイルJSONを選んでください。</p>
        <label class="file-label" for="conversion-profile-file">プロファイルを選択<input id="conversion-profile-file" type="file" accept=".json,application/json" ${busy?'disabled':''}></label>
        ${draft?`<div class="import-preview">${describe(draft)}<button class="primary" id="conversion-profile-apply" ${busy?'disabled':''}>確認してプロファイルを更新</button></div>`:''}
      </details>
      ${loadMessage?`<p role="alert" class="alert error">${escape(loadMessage)}</p>`:''}
      ${original!==undefined?'<button class="secondary" id="conversion-profile-original">元のプロファイルJSONをダウンロード</button>':''}
      ${profile?`${describe(profile)}<p class="muted">${saved?'プロファイル登録済み':'プロファイルはブラウザに未保存です。再読込前にJSONを保管してください'}</p><button class="secondary small" id="conversion-profile-backup">プロファイルをダウンロード</button>`:'<p>プロファイル未登録です。先にImportしてください。</p>'}
      ${bindingMessage?`<p class="alert" role="status">${escape(bindingMessage)}</p>`:''}
      <fieldset class="conversion-options"><legend>Export時だけ適用する仮育成</legend>
        <label class="check"><input id="conversion-live4" type="checkbox" ${options.liveSkill4?'checked':''} ${busy?'disabled':''}>ライブスキルLvを最低4にする</label>
        <label class="check"><input id="conversion-gekisou4" type="checkbox" ${options.gekisouSkill4?'checked':''} ${busy?'disabled':''}>撃奏スキルLvを最低4にする</label>
        <p class="muted">Lv5以上は維持します。Lv4に対応しないカードは実値を維持して一覧に示します。</p>
      </fieldset>
      ${summary?`<p>メンバー ${summary.data.members.length}枚 / Snap ${summary.data.snaps.length}枚 / キャラランク ${summary.ranks.length}人 / アイテム ${summary.data.items.length}件</p>
        <p>手入力ランク ${summary.ranks.length-estimated.length}人 / 推定ランク ${estimated.length}人（進捗不足 ${limited.length}人）</p>
        ${estimated.length?'<p class="alert">推定ランクは補正前の実所持から計算します。未入力のミッション進捗・過去の達成・報酬受取状況を再現できないため、実際のランクと異なる場合があります。</p>':''}
        <details><summary>出力するランク・育成値を確認</summary><ul>${summary.ranks.map(r=>`<li>${escape(state.master.characters.find(c=>c.id===r.id)!.name)}: ${r.effectiveRank}（${r.overrideRank===undefined?'推定':'手入力'}${r.overrideRank===undefined&&r.missingProgress.length?'・進捗不足':''}）</li>`).join('')}</ul>
        <div class="table-scroll"><table><thead><tr><th>メンバー</th><th>Lv / 特訓 / 覚醒</th><th>ライブ / 撃奏</th></tr></thead><tbody>${summary.data.members.map(m=>`<tr><td>${escape(state.master.members.find(c=>c.id===m.cardId)!.name)} · ID ${m.cardId}</td><td>${m.level} / ${m.trainingStage} / ${m.awakeningStage}</td><td>${m.liveSkillLevel} / ${m.gekisouSkillLevel}</td></tr>`).join('')}</tbody></table></div>
        <ul>${summary.data.snaps.map(s=>`<li>Snap ID ${s.supportCardId}: Lv${s.level} / 上限解放${s.rank}</li>`).join('')}${summary.data.items.map(i=>`<li>${escape(state.master.bandItems.find(item=>item.id===i.id)!.name)}: ${i.level===null?'未解放':'Lv'+i.level}</li>`).join('')}</ul></details>
        <p>仮育成の変更 ${summary.adjustments.length}件 / Lv4非対応 ${summary.skipped.length}件</p>
        ${summary.adjustments.length||summary.skipped.length?`<ul>${summary.adjustments.map(a=>`<li>ID ${a.cardId} ${a.skill}: Lv${a.before} → Lv${a.after}</li>`).join('')}${summary.skipped.map(s=>`<li>ID ${s.cardId} ${s.skill}: Lv4非対応のため実値を維持</li>`).join('')}</ul>`:''}`:''}
      ${blocked?`<p role="alert" class="alert error">${escape(blocked)}</p>`:''}
      <label class="check"><input id="conversion-complete" type="checkbox" ${options.complete?'checked':''} ${busy?'disabled':''}>実際に所持するメンバー・Snapをすべて登録したことを確認しました</label>
      <p class="muted">このアプリで管理していない情報の扱いと、出力先で必要な操作は、プロファイルの提供元で確認してください。</p>
      <button class="primary" id="conversion-preview" ${!profile||!bindingValid||blocked||busy?'disabled':''}>${busy?'検証中…':'出力内容を事前確認'}</button>
      ${preview?`<div class="import-preview" role="status"><strong>出力の検証が完了しました</strong><p>この内容で変換済みJSONをダウンロードできます。</p><button class="primary" id="conversion-download">変換済みJSONをダウンロード</button></div>`:''}
      ${notice?`<p class="alert" role="status">${escape(notice)}</p>`:''}
      <p>Exportしても登録中の所持・育成情報は変更しません。出力先への取り込みは、このアプリの外で行ってください。</p>
      <p><a href="https://github.com/morimori36/atsudori-tools/blob/main/docs/profile-export.md" target="_blank" rel="noreferrer">変換プロファイルの仕様と使い方</a></p></section>`;
    host.querySelector<HTMLInputElement>('#conversion-profile-file')?.addEventListener('change',async event=>{
      const file=(event.target as HTMLInputElement).files?.[0]; if(!file) return;
      const ticket=++readId; draft=undefined; invalidate(); notice='';
      try {
        if(file.size>PROFILE_LIMIT) throw new Error('プロファイルは5MiBまでです');
        const candidate=await importProfile(await file.text());
        await assertProfileCatalog(candidate,read().master);
        if(ticket!==readId) return; draft=candidate; notice='検証済みです。内容を確認して更新してください。';
      } catch(e) { if(ticket!==readId) return; notice=message(e); }
      render();
    });
    host.querySelector('#conversion-profile-apply')?.addEventListener('click',async()=>{
      if(!draft||busy) return;
      const candidate=draft; busy=true; render();
      try {
        await assertProfileCatalog(candidate,read().master);
        const result=saveJson(storage,PROFILE_STORAGE_KEY,()=>JSON.stringify(candidate,null,2)+'\n');
        profile=candidate; draft=undefined; saved=result.status==='saved'; loadMessage=''; invalidate();
        notice=saved?'プロファイルを更新しました':'プロファイルを保存できませんでした。'+(result.status==='failed'?result.error:'');
      } catch(e) { notice=message(e); }
      finally { busy=false; render(); }
    });
    host.querySelector('#conversion-profile-original')?.addEventListener('click',()=>download(original!,'atsudori-original-profile.json'));
    host.querySelector('#conversion-profile-backup')?.addEventListener('click',()=>download(JSON.stringify(profile,null,2)+'\n','atsudori-conversion-profile.json'));
    for(const [selector,key] of [['#conversion-live4','liveSkill4'],['#conversion-gekisou4','gekisouSkill4'],['#conversion-complete','complete']] as const) {
      host.querySelector<HTMLInputElement>(selector)?.addEventListener('change',e=>{options[key]=(e.target as HTMLInputElement).checked;invalidate();notice='';render();host?.querySelector<HTMLElement>(selector)?.focus();});
    }
    host.querySelector('#conversion-preview')?.addEventListener('click',async()=>{
      if(!profile||busy) return;
      const before=stamp(), state=read(); busy=true; invalidate(); notice=''; render();
      try {
        if(state.protected) throw new Error('元の保存JSONを復旧してください');
        const result=await exportConversion(state.master,state.collection,profile,options,undefined,state.rules);
        if(before!==stamp()) throw new Error('登録内容が変わりました。もう一度確認してください');
        preview=result; previewStamp=before;
      } catch(e) { notice=message(e); }
      finally { busy=false; render(); }
    });
    host.querySelector('#conversion-download')?.addEventListener('click',()=>{
      if(!preview||previewStamp!==stamp()) { invalidate();notice='登録内容が変わりました。もう一度事前確認してください';render();return; }
      download(preview.text,'atsudori-converted.json');
    });
  }
  return {mount(element:HTMLElement) { host=element;invalidate();render(); }};
}
