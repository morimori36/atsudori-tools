import { DEFAULT_TRAINING } from '../app/hypothetical-training';
import type { TrainingSettings } from '../app/hypothetical-training';
import type { TrainingSettingsStore } from '../storage/training-settings';
const fields=[['trainingStage','Member 特訓段階'],['awakeningStage','Member 覚醒段階'],['liveSkillLevel','Member ライブスキルLv'],['gekisouSkillLevel','Member 撃奏スキルLv'],['snapRank','Snap 上限解放段階']] as const;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function trainingSettingsSummary(store:TrainingSettingsStore):string {
  const settings=store.current();
  return fields.map(([key,label])=>`${label} ${settings[key]??'変更しない'}`).join(' / ');
}
export function trainingSettingsMarkup(store:TrainingSettingsStore):string {
  return `<section class="training-settings" aria-label="育成シミュレーション"><div class="training-heading"><strong>育成シミュレーション</strong><details class="training-help"><summary aria-label="育成シミュレーションの説明">ⓘ</summary><p>育成後は仮想の計算結果です。所持データは変更しません。評価値には絆最大時の理論キャラランクを使います。外部JSONには通常の育成後ランクを使い、絆理論値を含めません。</p></details></div><p class="training-summary">${escape(trainingSettingsSummary(store))}</p><button type="button" class="secondary" data-training-open>育成条件を変更</button>${store.message()?`<p role="status">${escape(store.message())}</p>`:''}</section>`;
}
export function bindTrainingSettings(host:HTMLElement,store:TrainingSettingsStore):void {
  host.querySelector('[data-training-open]')?.addEventListener('click',()=>{
    const dialog=document.createElement('dialog');
    dialog.className='training-dialog';
    dialog.setAttribute('aria-labelledby','training-dialog-title');
    const render=()=>{
      const settings=store.current();
      dialog.innerHTML=`<h2 id="training-dialog-title">育成条件</h2><div class="training-grid">${fields.map(([key,label])=>`<label>${label}<select data-training="${key}" ${store.damaged()?'disabled':''}>${[null,1,2,3,4,5].map(n=>`<option value="${n??''}" ${settings[key]===n?'selected':''}>${n??'変更しない'}</option>`).join('')}</select></label>`).join('')}</div><details class="training-help"><summary>「変更しない」とLvについて</summary><p>指定値は目標で、現在値を下げません。マスタの合法な段階だけを使います。「変更しない」はその段階・スキルLvを維持します。Member LvとSnap Lvは、段階を維持する場合も育成後の段階のLv上限まで上げます。</p></details><p class="muted">変更はすぐに3画面へ反映されます。</p><p data-training-message role="status">${escape(store.message())}</p>${store.damaged()?'<button type="button" data-training-reset>保存設定を初期設定で置き換える</button>':''}<div class="training-dialog-actions"><button type="button" class="primary" data-training-close>閉じる</button></div>`;
      dialog.querySelectorAll<HTMLSelectElement>('[data-training]').forEach(select=>select.addEventListener('change',()=>{
        store.update({...store.current(),[select.dataset.training!]:select.value===''?null:Number(select.value)} as TrainingSettings);
        dialog.querySelector('[data-training-message]')!.textContent=store.message();
      }));
      dialog.querySelector('[data-training-reset]')?.addEventListener('click',()=>{
        store.update({...DEFAULT_TRAINING},true);render();dialog.querySelector<HTMLElement>('[data-training]')?.focus();
      });
      dialog.querySelector('[data-training-close]')!.addEventListener('click',()=>dialog.close());
    };
    render();
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...dialog.querySelectorAll<HTMLElement>('select:not(:disabled), button:not(:disabled), summary')].filter(e=>e.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    // Mount outside page rerenders so immediate calculations preserve modal focus and native focus trapping.
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{
      dialog.remove();host.querySelector<HTMLElement>('[data-training-open]')?.focus({preventScroll:true});
    },{once:true});
    dialog.showModal();
    dialog.querySelector<HTMLElement>(store.damaged()?'[data-training-close]':'[data-training]')?.focus();
  });
}
/** Keep open details and scroll position through a page update. The modal owns its focus. */
export function preserveTrainingView(host:HTMLElement,render:()=>void):void {
  const opened=[...host.querySelectorAll('details')].map(d=>d.open);
  const x=window.scrollX,y=window.scrollY;
  render();
  host.querySelectorAll('details').forEach((d,i)=>{if(opened[i]!==undefined)d.open=opened[i]!;});
  window.scrollTo(x,y);
}
