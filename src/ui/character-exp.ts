import type { Masterdata, MemberMaster, SnapMaster } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { TrainingSettings } from '../app/hypothetical-training';
import { createCharacterExpScenarios } from '../app/character-exp-scenarios';
import type { ExpResult, ExpGoal, ExpCard } from '../app/character-exp-scenarios';
import { openDialog } from './dialog';
import { collectionCardAttributes, collectionCardIdentity, projectedStages, escape } from './collection-card';
import { characterDisplayOrder } from './character-order';

const number=(v:number)=>v.toLocaleString('ja-JP');
const exp=(r:ExpResult<number>)=>r.status==='ready'?`+${number(r.value)} EXP`:'未算出';
const goal=(r:ExpResult<ExpGoal>)=>r.status==='ready'?`最終ランク ${number(r.value.rank)} · ${r.value.reached?'目標到達':`不足 ${number(r.value.missingExp)} EXP`}`:`未算出：${escape(r.reason)}`;
export interface ExpView { targetRank:number; targetInput?:string }

export function createCharacterExpView(master:Masterdata,collection:Collection,settings:TrainingSettings,trained:Collection,state:ExpView,protectedData=false) {
  const scenarios=createCharacterExpScenarios(master,collection,settings,trained);
  const goalResult=(id:number):ExpResult<ExpGoal>=>protectedData?{status:'pending',reason:'保存データを保護中です。JSON Import / Exportで復旧してください。'}:scenarios.goal(id,state.targetRank);
  const raw=state.targetInput??String(state.targetRank);
  const valid=(value:string)=>/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))&&master.characterRankLevels.includes(Number(value));
  const targetError='マスタに登録された合法ランクを入力してください。';
  return {
    targetMarkup:`<div class="exp-target"><label class="field" for="exp-target"><span>目標キャラランク</span><input id="exp-target" type="number" inputmode="numeric" min="1" step="1" data-exp-target value="${escape(raw)}" aria-invalid="${!valid(raw)}" aria-describedby="exp-target-error"></label><p id="exp-target-error" role="alert">${valid(raw)?'':targetError}</p></div>`,
    summary(id:number,theoryMarkup:string) {
      const result=goalResult(id);
      const recovery:ExpResult<number>=protectedData?{status:'pending',reason:'保存データを保護中です。JSON Import / Exportで復旧してください。'}:scenarios.recoverable(id);
      return `<div class="exp-overview" data-exp-recoverable><span>回収可能EXP</span><strong>${exp(recovery)}</strong>${recovery.status==='pending'?`<small>${escape(recovery.reason)}</small>`:''}</div>${theoryMarkup}<div class="exp-overview exp-goal" data-exp-goal><span>目標までの不足EXP</span><strong>${result.status==='ready'?`${number(result.value.missingExp)} EXP`:'未算出'}</strong><small>目標ランク <span data-exp-goal-rank>${number(state.targetRank)}</span></small>${result.status==='pending'?`<small>${escape(result.reason)}</small>`:''}</div>`;
    },
    button(id:number) {return `<button type="button" class="secondary small exp-detail-button" data-exp-detail="${id}" ${protectedData?'disabled':''}>カード別EXP</button>`;},
    bind(host:HTMLElement,rerender:()=>void) {
      const target=host.querySelector<HTMLInputElement>('[data-exp-target]');
      const validate=()=>{
        if(!target)return false;
        state.targetInput=target.value;
        const ok=valid(target.value);target.setAttribute('aria-invalid',String(!ok));
        host.querySelector('#exp-target-error')!.textContent=ok?'':`${targetError}${valid(String(state.targetRank))?` 試算は確定済みの${state.targetRank}で表示しています。`:''}`;
        return ok;
      };
      target?.addEventListener('input',validate);
      const commit=()=>{if(validate()){state.targetRank=Number(target!.value);rerender();host.querySelector<HTMLElement>('[data-exp-target]')?.focus({preventScroll:true});}};
      target?.addEventListener('change',commit);
      target?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();}});
      host.querySelectorAll<HTMLButtonElement>('[data-exp-detail]').forEach(button=>button.addEventListener('click',()=>{
        const id=Number(button.dataset.expDetail),character=master.characters.find(c=>c.id===id)!;
        const dialog=document.createElement('dialog');
        dialog.className='training-dialog exp-dialog';dialog.setAttribute('aria-labelledby','exp-dialog-title');
        dialog.innerHTML=`<div class="exp-dialog-heading"><h2 id="exp-dialog-title" tabindex="-1" autofocus>${escape(character.name)}のカード別EXP</h2><button type="button" class="secondary" data-exp-close aria-label="閉じる">閉じる</button></div><p data-exp-dialog-goal>${goal(goalResult(id))}（目標 ${state.targetRank}）</p>
          <div class="progress-targets exp-tabs" role="tablist" aria-label="カードの所持状態"><button type="button" role="tab" id="exp-owned-tab" data-exp-ownership="owned" aria-selected="true" aria-controls="exp-sections" tabindex="0">所持カード</button><button type="button" role="tab" id="exp-unowned-tab" data-exp-ownership="unowned" aria-selected="false" aria-controls="exp-sections" tabindex="-1">未所持カード</button></div>
          <div class="catalog-tools"><label class="field catalog-search"><span>カード名・タイトル・IDで検索</span><input type="search" data-exp-query></label></div>
          <details class="exp-help"><summary>試算の見方</summary><p>所持は現在からその1枚を育成した直接EXP。未所持は所持カードを全育成した状態にその1枚を加えた直接EXPです。所持分は画面の育成理論値に含みます。カード別増分は非加算で、合計と一括育成の結果が異なる場合があります。</p><p>未所持は現在入手可能とは限りません。直接EXPに絆由来EXPを含めません。</p></details><div id="exp-sections" role="tabpanel" aria-labelledby="exp-owned-tab" data-exp-sections></div>`;
        let ownership:'owned'|'unowned'='owned';
        const limits={owned:{member:20,snap:20},unowned:{member:20,snap:20}};
        // Fast per-card contribution deltas; full bond projections remain lazy on disclosure.
        const all=[...scenarios.cards(id,true),...scenarios.cards(id,false)].map(card=>({card,direct:scenarios.direct(card,id)}));
        function cardMarkup(card:ExpCard,direct:ExpResult<number>):string {
          const row=scenarios.state(card);
          const metadata=(card.kind==='member'?master.members:master.snaps).find(c=>c.id===card.id)!;
          const from=row.before as unknown as Record<string,number>|undefined;
          const to=row.after.status==='ready'?row.after.value as unknown as Record<string,number>:undefined;
          const currentLevel=from?number(from.level!):'未所持';
          const lv=`<p class="derived-level">Lv <span class="projection-current">現在 ${currentLevel}</span> → <span class="projection-target">目標 ${to?number(to.level!):'未算出'}</span></p>`;
          const stages=(key:string,label:string,levels:number[])=>projectedStages(label,levels,from?.[key],to?.[key]);
          let axes:string;
          if(card.kind==='member'){
            const m=metadata as MemberMaster;
            axes=stages('trainingStage','特訓段階',master.memberTraining.filter(r=>r.group===m.trainingGroup).map(r=>r.stage))+
              stages('awakeningStage','覚醒段階 A',master.memberAwakening.filter(r=>r.group===m.awakeningGroup).map(r=>r.stage))+
              stages('liveSkillLevel','ライブスキルLv',m.liveSkillLevels)+stages('gekisouSkillLevel','撃奏スキルLv',m.gekisouSkillLevels);
          }else{
            const s=metadata as SnapMaster;
            axes=stages('rank','上限解放 U',master.snapRanks.filter(r=>r.group===s.rankGroup).map(r=>r.rank));
          }
          const names=card.kind==='snap'?characterDisplayOrder(master.characters.filter(c=>card.characterIds.includes(c.id))).map(c=>c.name).join(' / '):'';
          return `<article ${collectionCardAttributes(metadata,card.owned,'exp-card')} data-exp-card="${card.kind}-${card.id}">${collectionCardIdentity(metadata,card.owned,names,true)}<div class="exp-card-growth"><p class="exp-direct" data-exp-direct><span>直接EXP</span> <strong>${exp(direct)}</strong></p>${direct.status==='pending'?`<small>${escape(direct.reason)}</small>`:''}${lv}<div class="form-grid">${axes}</div>${row.after.status==='pending'?`<p class="warning">未算出：${escape(row.after.reason)}</p>`:''}<details data-exp-result="${card.kind}-${card.id}"><summary>最終ランク・絆由来EXP</summary><div data-exp-result-body></div></details></div></article>`;
        }
        const draw=()=>{
          const query=dialog.querySelector<HTMLInputElement>('[data-exp-query]')!.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
          dialog.querySelector('[data-exp-sections]')!.innerHTML=(['member','snap'] as const).map(kind=>{
            const rows=all.filter(r=>r.card.owned===(ownership==='owned')&&r.card.kind===kind&&`${r.card.name} ${r.card.title} ${r.card.id}`.normalize('NFKC').toLocaleLowerCase('ja').includes(query))
              .sort((a,b)=>(b.direct.status==='ready'?b.direct.value:-1)-(a.direct.status==='ready'?a.direct.value:-1)||a.card.id-b.card.id);
            return `<section data-exp-kind-section="${kind}"><h3>${kind==='member'?'メンバー':'スナップ'}</h3><p class="muted catalog-count" data-exp-count role="status">該当 ${rows.length}枚 / 表示 ${Math.min(limits[ownership][kind],rows.length)}枚</p><div class="catalog-grid">${rows.slice(0,limits[ownership][kind]).map(({card,direct})=>cardMarkup(card,direct)).join('')||'<p>該当するカードはありません。</p>'}</div><button type="button" class="secondary" data-exp-more="${kind}" ${limits[ownership][kind]>=rows.length?'hidden':''}>続きを表示</button></section>`;
          }).join('');
          dialog.querySelectorAll<HTMLDetailsElement>('[data-exp-result]').forEach(details=>details.addEventListener('toggle',()=>{
            if(!details.open||details.querySelector('[data-exp-final]'))return;
            const card=all.find(c=>`${c.card.kind}-${c.card.id}`===details.dataset.expResult)!.card;
            const row=scenarios.detail(card,id,state.targetRank);
            details.querySelector('[data-exp-result-body]')!.innerHTML=`<p data-exp-final>${goal(row.goal)}</p><p>絆由来の間接EXP増分 ${exp(row.indirect)}</p>`;
          }));
          dialog.querySelectorAll<HTMLButtonElement>('[data-exp-more]').forEach(button=>button.addEventListener('click',()=>{
            const kind=button.dataset.expMore as 'member'|'snap';
            const scroll=dialog.scrollTop;limits[ownership][kind]+=20;draw();dialog.scrollTop=scroll;
            dialog.querySelector<HTMLElement>(`[data-exp-kind-section="${kind}"] [data-exp-card]:nth-child(${limits[ownership][kind]-19}) details summary`)?.focus({preventScroll:true});
          }));
        };
        const tabs=[...dialog.querySelectorAll<HTMLButtonElement>('[data-exp-ownership]')];
        const select=(tab:HTMLButtonElement)=>{
          ownership=tab.dataset.expOwnership as typeof ownership;
          for(const button of tabs){
            const selected=button===tab;
            button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
          }
          dialog.querySelector('[data-exp-sections]')!.setAttribute('aria-labelledby',tab.id);
          draw();
        };
        tabs.forEach((tab,index)=>{
          tab.addEventListener('click',()=>select(tab));
          tab.addEventListener('keydown',event=>{
            const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:undefined;
            if(next===undefined)return;
            event.preventDefault();select(tabs[next]!);tabs[next]!.focus();
          });
        });
        dialog.querySelector('[data-exp-query]')!.addEventListener('input',()=>{for(const category of Object.values(limits))category.member=category.snap=20;draw();});
        dialog.querySelector('[data-exp-close]')!.addEventListener('click',()=>dialog.close());
        draw();openDialog(dialog,()=>host.querySelector<HTMLElement>(`[data-exp-detail="${id}"]`),dialog.querySelector<HTMLElement>('#exp-dialog-title'));
      }));
    },
  };
}
