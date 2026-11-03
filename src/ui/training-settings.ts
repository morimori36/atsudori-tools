import { DEFAULT_TRAINING } from '../app/hypothetical-training';
import type { TrainingSettings } from '../app/hypothetical-training';
import type { TrainingSettingsStore } from '../storage/training-settings';
const fields=[['trainingStage','メンバー 特訓段階','特訓'],['awakeningStage','メンバー 覚醒段階','覚醒'],['liveSkillLevel','メンバー ライブスキルLv','ライブ'],['gekisouSkillLevel','メンバー 撃奏スキルLv','撃奏'],['snapRank','スナップ 上限解放段階','上限解放']] as const;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function trainingSettingsSummary(store:TrainingSettingsStore):string {
  const settings=store.current();
  return `<div class="training-summary">${(['メンバー','スナップ'] as const).map((group,index)=>`<section class="training-summary-group" aria-label="${group}"><h3>${group}</h3><dl>${fields.slice(index===0?0:4,index===0?4:5).map(([key,,label])=>`<div data-training-summary="${key}"><dt>${label}</dt><dd>${settings[key]??'—'}</dd></div>`).join('')}</dl></section>`).join('')}</div>`;
}
export function trainingSettingsMarkup(store:TrainingSettingsStore):string {
  return `<section class="training-settings" aria-label="育成条件"><div class="training-heading"><strong>育成条件</strong><button type="button" class="training-info" aria-label="育成条件の説明" aria-describedby="training-info-tooltip" popovertarget="training-info-tooltip">ⓘ</button><span id="training-info-tooltip" class="training-tooltip" popover="auto" role="tooltip">育成後は仮想の計算結果です。所持データは変更しません。評価値には絆最大時の理論キャラランクを使います。外部JSONには通常の育成後ランクを使い、絆理論値を含めません。</span></div>${trainingSettingsSummary(store)}<button type="button" class="secondary" data-training-open>育成条件を変更</button>${store.message()?`<p role="status">${escape(store.message())}</p>`:''}</section>`;
}
export function bindTrainingSettings(host:HTMLElement,store:TrainingSettingsStore):void {
  const info=host.querySelector<HTMLButtonElement>('.training-info');
  const tip=host.querySelector<HTMLElement>('#training-info-tooltip');
  if(info&&tip) {
    let pinned=false;
    let leaveTimer:ReturnType<typeof setTimeout>|undefined;
    const cancelLeave=()=>{clearTimeout(leaveTimer);leaveTimer=undefined;};
    const hide=()=>{cancelLeave();pinned=false;if(tip.matches(':popover-open'))tip.hidePopover();};
    const position=()=>{
      const anchor=info.getBoundingClientRect(),rect=tip.getBoundingClientRect();
      tip.style.left=`${Math.max(8,Math.min(anchor.left,window.innerWidth-rect.width-8))}px`;
      tip.style.top=`${Math.max(8,anchor.bottom+rect.height+8<=window.innerHeight?anchor.bottom+6:anchor.top-rect.height-6)}px`;
    };
    let dismissal:AbortController|undefined;
    tip.addEventListener('toggle',()=>{
      dismissal?.abort();
      if(!tip.matches(':popover-open')){cancelLeave();pinned=false;return;}
      position();dismissal=new AbortController();
      window.addEventListener('scroll',hide,{capture:true,signal:dismissal.signal});
      window.addEventListener('resize',hide,{signal:dismissal.signal});
    });
    const show=()=>{cancelLeave();if(!tip.matches(':popover-open'))tip.showPopover();position();};
    info.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')show();});
    tip.addEventListener('pointerenter',cancelLeave);
    info.addEventListener('focus',show);
    info.addEventListener('click',event=>{
      // A click after hover pins the explanation instead of immediately hiding it.
      event.preventDefault();
      if(pinned&&tip.matches(':popover-open'))hide();else{pinned=true;show();}
    });
    const canDismiss=()=>!pinned&&document.activeElement!==info&&!info.matches(':hover')&&!tip.matches(':hover');
    const leave=()=>{
      cancelLeave();
      // Give the pointer time to cross the 6px gap in either direction.
      if(canDismiss())leaveTimer=setTimeout(()=>{if(canDismiss())hide();},250);
    };
    info.addEventListener('pointerleave',leave);tip.addEventListener('pointerleave',leave);
    info.addEventListener('blur',leave);
  }
  host.querySelector('[data-training-open]')?.addEventListener('click',()=>{
    const dialog=document.createElement('dialog');
    dialog.className='training-dialog';
    dialog.setAttribute('aria-labelledby','training-dialog-title');
    const render=()=>{
      const settings=store.current();
      dialog.innerHTML=`<h2 id="training-dialog-title">育成条件</h2><div class="training-grid">${fields.map(([key,label])=>`<label>${label}<select data-training="${key}" ${store.damaged()?'disabled':''}>${[null,1,2,3,4,5].map(n=>`<option value="${n??''}" ${settings[key]===n?'selected':''}>${n??'変更しない'}</option>`).join('')}</select></label>`).join('')}</div><details class="training-help"><summary>「変更しない」とLvについて</summary><p>指定値は目標で、現在値を下げません。マスタの合法な段階だけを使います。「変更しない」はその段階・スキルLvを維持します。メンバー Lvとスナップ Lvは、段階を維持する場合も育成後の段階のLv上限まで上げます。</p></details><p class="muted">変更はすぐに3画面へ反映されます。</p><p data-training-message role="status">${escape(store.message())}</p>${store.damaged()?'<button type="button" data-training-reset>保存設定を初期設定で置き換える</button>':''}<div class="training-dialog-actions"><button type="button" class="primary" data-training-close>閉じる</button></div>`;
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
  const key=(d:HTMLDetailsElement)=>d.dataset.materialResource!==undefined?'material:'+d.dataset.materialResource:d.dataset.bondCharacter!==undefined?'bond:'+d.dataset.bondCharacter:undefined;
  const keyed=new Map([...host.querySelectorAll('details')].filter(d=>key(d)!==undefined).map(d=>[key(d),d.open]));
  const opened=[...host.querySelectorAll('details')].map(d=>d.open);
  const x=window.scrollX,y=window.scrollY;
  render();
  host.querySelectorAll('details').forEach((d,i)=>{const value=key(d)===undefined?opened[i]:keyed.get(key(d));if(value!==undefined)d.open=value;});
  window.scrollTo(x,y);
}
