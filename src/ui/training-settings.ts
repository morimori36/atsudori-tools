import { DEFAULT_TRAINING } from '../app/hypothetical-training';
import type { TrainingSettings } from '../app/hypothetical-training';
import type { TrainingSettingsStore } from '../storage/training-settings';
const fields=[['trainingStage','特訓段階'],['awakeningStage','覚醒段階'],['liveSkillLevel','ライブスキルLv'],['gekisouSkillLevel','撃奏スキルLv']] as const;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function trainingSettingsMarkup(store:TrainingSettingsStore):string {
  const settings=store.current();
  return `<fieldset class="training-settings"><legend>共通の仮育成設定</legend><div class="training-grid">${fields.map(([key,label])=>`<label>${label}<select data-training="${key}" ${store.damaged()?'disabled':''}>${[null,2,3,4,5].map(n=>`<option value="${n??''}" ${settings[key]===n?'selected':''}>${n??'引き上げない'}</option>`).join('')}</select></label>`).join('')}</div><p class="muted">指定値は引き上げ先の目標であり、現在値を下げません。カードの合法な段階・Lvまで適用します。特訓が上がる場合だけメンバーLvを上限に合わせます。</p><p class="muted">キャラクターランク・総合ランクボーナス・Snap・バンドアイテムは実所持の状態を使います。所持データは変更しません。</p>${store.message()?`<p role="status">${escape(store.message())}</p>`:''}${store.damaged()?'<button type="button" data-training-reset>保存設定を初期設定で置き換える</button>':''}</fieldset>`;
}
export function bindTrainingSettings(host:HTMLElement,store:TrainingSettingsStore):void {
  host.querySelectorAll<HTMLSelectElement>('[data-training]').forEach(select=>select.addEventListener('change',()=>{
    store.update({...store.current(),[select.dataset.training!]:select.value===''?null:Number(select.value)} as TrainingSettings);
  }));
  host.querySelector('[data-training-reset]')?.addEventListener('click',()=>store.update({...DEFAULT_TRAINING},true));
}
/** Keep open details, scroll position and the edited control through a local rerender. */
export function preserveTrainingView(host:HTMLElement,render:()=>void):void {
  const active=document.activeElement as HTMLElement|null;
  const key=host.contains(active)?active?.dataset.training:undefined;
  const opened=[...host.querySelectorAll('details')].map(d=>d.open);
  const x=window.scrollX,y=window.scrollY;
  render();
  host.querySelectorAll('details').forEach((d,i)=>{if(opened[i]!==undefined)d.open=opened[i]!;});
  if(key) host.querySelector<HTMLElement>(`[data-training="${key}"]`)?.focus({preventScroll:true});
  window.scrollTo(x,y);
}
