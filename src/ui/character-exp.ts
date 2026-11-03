import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { TrainingSettings } from '../app/hypothetical-training';
import { createCharacterExpScenarios, legalExpTarget } from '../app/character-exp-scenarios';
import type { ExpResult, ExpGoal } from '../app/character-exp-scenarios';
import { openDialog } from './dialog';
import { cardIdentity } from './card-identity';

const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(v:number)=>v.toLocaleString('ja-JP');
const exp=(r:ExpResult<number>)=>r.status==='ready'?`+${number(r.value)} EXP`:`未算出：${escape(r.reason)}`;
const goal=(r:ExpResult<ExpGoal>)=>r.status==='ready'?`最終ランク ${number(r.value.rank)} · ${r.value.reached?'目標到達':`不足 ${number(r.value.missingExp)} EXP`}`:`未算出：${escape(r.reason)}`;
export interface ExpView { targetRank:number }

export function createCharacterExpView(master:Masterdata,collection:Collection,settings:TrainingSettings,trained:Collection,state:ExpView) {
  const scenarios=createCharacterExpScenarios(master,collection,settings,trained);
  const target=legalExpTarget(master,state.targetRank);
  if(target!==undefined)state.targetRank=target;
  const summary=(id:number)=>scenarios.summary(id,state.targetRank);
  return {
    targetMarkup:`<label class="exp-target">目標キャラランク <select data-exp-target ${target===undefined?'disabled':''}>${[...master.characterRankLevels].sort((a,b)=>a-b).map(r=>`<option value="${r}" ${r===target?'selected':''}>${r}</option>`).join('')}</select></label><p class="muted">所持育成余地は現在からの増分。未所持獲得余地は所持育成後から関連する全未所持を取得・育成した直接EXP増分です。不足EXPは所持育成後・絆理論値の最終EXPから計算し、未入力進捗は加算しません。</p>`,
    summary(id:number) {
      const row=summary(id);
      return `<span class="exp-overview" data-exp-owned><span>所持カード育成余地</span><strong>${exp(row.owned)}</strong></span><span class="exp-overview" data-exp-unowned><span>未所持カード獲得余地</span><strong>${exp(row.unowned)}</strong></span><span class="exp-overview" data-exp-goal>${goal(row.goal)}</span>`;
    },
    button(id:number) {return `<button type="button" class="secondary small exp-detail-button" data-exp-detail="${id}">育成・獲得EXPの詳細</button>`;},
    bind(host:HTMLElement,rerender:()=>void) {
      host.querySelector<HTMLSelectElement>('[data-exp-target]')?.addEventListener('change',event=>{
        state.targetRank=Number((event.target as HTMLSelectElement).value);rerender();
        host.querySelector<HTMLElement>('[data-exp-target]')?.focus({preventScroll:true});
      });
      host.querySelectorAll<HTMLButtonElement>('[data-exp-detail]').forEach(button=>button.addEventListener('click',()=>{
        const id=Number(button.dataset.expDetail),character=master.characters.find(c=>c.id===id)!;
        const dialog=document.createElement('dialog');
        dialog.className='training-dialog exp-dialog';dialog.setAttribute('aria-labelledby','exp-dialog-title');
        dialog.innerHTML=`<h2 id="exp-dialog-title">${escape(character.name)}の育成・獲得EXP</h2><p data-exp-dialog-goal>${goal(summary(id).goal)}（目標 ${state.targetRank}）</p><p class="muted">所持：現在→全所持育成後。未所持：全所持育成後→関連する全未所持を各1枚仮取得・育成後。概要は全件同時に計算し、カード別増分の合計とは一致しない場合があります。直接EXPに絆由来EXPを含めません。</p>
          <label>表示対象<select data-exp-ownership><option value="owned">所持カード</option><option value="unowned">未所持カード</option></select></label>
          <div class="exp-filters"><label>カード名・タイトルで検索<input type="search" data-exp-query></label><label>カード種類<select data-exp-kind><option value="">すべて</option><option value="member">メンバー</option><option value="snap">スナップ</option></select></label><label><input type="checkbox" data-exp-positive checked>直接EXP増分あり・未算出のみ</label></div>
          <p class="muted">直接EXPの大きい順。各行はその1枚だけを変更する独立試算です。未所持は現在のガチャで入手可能という意味ではありません。</p><p data-exp-count role="status"></p><div data-exp-rows></div><button type="button" class="secondary" data-exp-more>続きを表示</button><div class="training-dialog-actions"><button type="button" class="primary" data-exp-close>閉じる</button></div>`;
        let limit=20;
        const draw=()=>{
          const owned=dialog.querySelector<HTMLSelectElement>('[data-exp-ownership]')!.value==='owned';
          const query=dialog.querySelector<HTMLInputElement>('[data-exp-query]')!.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
          const kind=dialog.querySelector<HTMLSelectElement>('[data-exp-kind]')!.value;
          const positive=dialog.querySelector<HTMLInputElement>('[data-exp-positive]')!.checked;
          const all=scenarios.cards(id,owned);
          const rows=all.filter(c=>(!kind||c.kind===kind)&&`${c.name} ${c.title}`.normalize('NFKC').toLocaleLowerCase('ja').includes(query))
            .map(card=>({card,direct:scenarios.direct(card,id)}))
            .filter(r=>!positive||r.direct.status==='pending'||r.direct.value>0)
            .sort((a,b)=>(b.direct.status==='ready'?b.direct.value:-1)-(a.direct.status==='ready'?a.direct.value:-1)||a.card.kind.localeCompare(b.card.kind)||a.card.id-b.card.id);
          dialog.querySelector('[data-exp-count]')!.textContent=`メンバー ${all.filter(c=>c.kind==='member').length}枚 · スナップ ${all.filter(c=>c.kind==='snap').length}枚 · 該当 ${rows.length}枚 / 表示 ${Math.min(limit,rows.length)}枚`;
          dialog.querySelector('[data-exp-rows]')!.innerHTML=rows.slice(0,limit).map(({card})=>{
            const row=scenarios.detail(card,id,state.targetRank);
            const metadata=(card.kind==='member'?master.members:master.snaps).find(c=>c.id===card.id)!;
            const axes=card.kind==='member'?[['level','Lv'],['trainingStage','特訓'],['awakeningStage','覚醒'],['liveSkillLevel','ライブ'],['gekisouSkillLevel','撃奏']]:[['level','Lv'],['rank','上限解放']];
            const from=row.before as unknown as Record<string,number>|undefined;
            const to=row.after.status==='ready'?row.after.value as unknown as Record<string,number>:undefined;
            const stages=to?axes.map(([key,label])=>`${label} ${from?.[key!]??'新規'}→${to[key!]}`).join(' · '):'育成状態は未算出';
            return `<article class="exp-row" data-exp-card="${card.kind}-${card.id}"><h3>${card.kind==='member'?'メンバー':'スナップ'} · ${cardIdentity(metadata)}</h3><p>${escape(stages)}</p><p data-exp-direct>直接EXP増分 ${exp(row.direct)}</p><p data-exp-final>${goal(row.goal)}</p><p class="muted">絆由来の間接EXP増分 ${exp(row.indirect)}</p></article>`;
          }).join('')||'<p>条件に一致するカードがありません。</p>';
          dialog.querySelector<HTMLButtonElement>('[data-exp-more]')!.hidden=limit>=rows.length;
        };
        dialog.querySelectorAll('select,input').forEach(control=>control.addEventListener(control.matches('[type=search]')?'input':'change',()=>{limit=20;draw();}));
        dialog.querySelector('[data-exp-more]')!.addEventListener('click',()=>{limit+=20;draw();});
        dialog.querySelector('[data-exp-close]')!.addEventListener('click',()=>dialog.close());
        draw();openDialog(dialog,()=>host.querySelector<HTMLElement>(`[data-exp-detail="${id}"]`),dialog.querySelector<HTMLElement>('[data-exp-ownership]'));
      }));
    },
  };
}
