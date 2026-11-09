import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { validateResourceInventory } from '../domain/materials/inventory';
import type { ResourceInventory } from '../domain/materials/inventory';
import { resourcesForDisplay, RESOURCE_SECTIONS } from './resource-order';
import { escape } from './collection-card';

export interface InventoryViewState { query:string; drafts:Map<string,string> }
export function createResourceInventoryView(master:Masterdata,collection:Collection,state:InventoryViewState) {
  let inventory={...collection.resourceInventory};
  const resources=master.materialDefinition?.resources??[];
  const supported=resourcesForDisplay(resources);
  const sections=RESOURCE_SECTIONS;
  const unsupported=Object.entries(inventory).filter(([id])=>!supported.some(r=>r.id===id));
  return {
    html:`<section class="inventory-management"><section class="panel catalog-tools" aria-label="一覧の絞り込み"><div class="catalog-toolbar"><label class="field catalog-search"><span>素材名・IDで検索</span><input type="search" data-inventory-query value="${escape(state.query)}" placeholder="素材名を入力"></label></div><p class="muted catalog-help">変更は自動保存 · 空欄は未登録、0は在庫0</p><p class="muted catalog-count" data-inventory-count role="status"></p></section>
      ${!master.materialDefinition?'<p class="warning">素材マスタ未登録です。</p>':''}<div data-inventory-rows>${sections.map(s=>`<section data-inventory-section="${s.unit}" aria-label="${s.title}"><h2 class="inventory-heading">${s.title}</h2><div class="inventory-grid" data-inventory-grid="${s.unit}"></div></section>`).join('')}<p class="panel catalog-empty" data-inventory-empty hidden>条件に一致する素材がありません。</p></div>
      ${unsupported.length?`<details class="panel inventory-unsupported"><summary>参照不能の在庫（${unsupported.length}件を保持）</summary>${unsupported.map(([id,quantity])=>`<p data-inventory-unsupported="${escape(id)}">ID ${escape(id)} · 登録値 ${quantity.toLocaleString('ja-JP')} · 現在のマスタに対応する素材なし</p>`).join('')}</details>`:''}</section>`,
    bind(host:HTMLElement,save:(inventory:ResourceInventory)=>boolean,schedule:(id:string,save:()=>void,immediate:boolean)=>void) {
      const query=host.querySelector<HTMLInputElement>('[data-inventory-query]')!;
      const container=host.querySelector('[data-inventory-rows]')!;
      const markup=(r:typeof supported[number])=>`<article class="panel collection-card inventory-card ${Object.hasOwn(inventory,r.id)?'is-owned':''}" data-inventory-row="${escape(r.id)}"><div class="card-identity"><span class="card-meta"><span class="card-id">ID ${escape(r.id)}</span><span data-inventory-status>${Object.hasOwn(inventory,r.id)?'登録済み':'未登録'}</span></span><h3 class="card-name">${escape(r.name)}</h3></div><div><label class="field"><span>現在庫（${r.unit==='exp'?'EXP':r.unit==='card'?'枚':'個'}）</span><input type="number" inputmode="numeric" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" autocomplete="off" placeholder="未登録" data-inventory-input="${escape(r.id)}" value="${escape(state.drafts.get(r.id)??inventory[r.id]??'')}" aria-label="${escape(r.name)}の現在庫"></label><p class="card-input-state" data-inventory-error role="alert"></p></div></article>`;
      for(const section of sections)container.querySelector(`[data-inventory-grid="${section.unit}"]`)!.innerHTML=supported.filter(r=>r.unit===section.unit).map(markup).join('');
      host.querySelectorAll<HTMLInputElement>('[data-inventory-input]').forEach(input=>{
        const id=input.dataset.inventoryInput!;
        const report=(message:string)=>{
          const current=input;
          current.setAttribute('aria-invalid',String(Boolean(message)));
          current.closest('article')!.querySelector('[data-inventory-error]')!.textContent=message;
        };
        const commit=()=>{
          const raw=state.drafts.get(id)?.trim();if(raw===undefined)return;
          if(raw!==''&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))){report('0以上の安全な整数を入力してください。空欄は未登録です。');return;}
          const next={...inventory};if(raw==='')delete next[id];else next[id]=Number(raw);
          try{validateResourceInventory(next);}catch{report('素材在庫の件数・値を確認してください。');return;}
          if(!save(next)){report('保存できませんでした。入力を確認して再試行してください。');return;}
          inventory=next;state.drafts.delete(id);report('');
          const row=input.closest<HTMLElement>('[data-inventory-row]');
          row?.classList.toggle('is-owned',Object.hasOwn(inventory,id));
          if(row)row.querySelector('[data-inventory-status]')!.textContent=Object.hasOwn(inventory,id)?'登録済み':'未登録';
        };
        // Number inputs expose invalid partial text (e.g. '-') as value=''.
        // Keep it distinct from an intentional clear, including across navigation.
        input.addEventListener('input',()=>{state.drafts.set(id,input.validity.badInput?(input.value||'-'):input.value);report('');schedule(id,commit,false);});
        input.addEventListener('wheel',event=>{if(document.activeElement===input)event.preventDefault();},{passive:false});
        input.addEventListener('change',()=>schedule(id,commit,true));
        if(state.drafts.has(id))report('未保存の入力があります。値を確認してください。');
      });
      // Reuse the input nodes so filtering preserves native partial input and focus state.
      const nodes=new Map([...container.querySelectorAll<HTMLElement>('[data-inventory-row]')].map(card=>[card.dataset.inventoryRow,card]));
      const cards=supported.map(r=>nodes.get(r.id)!);
      const units=new Map(supported.map(r=>[r.id,r.unit]));
      const draw=()=>{
        const q=state.query.trim().normalize('NFKC').toLocaleLowerCase('ja');
        const rows=cards.filter((_,i)=>`${supported[i]!.name} ${supported[i]!.id}`.normalize('NFKC').toLocaleLowerCase('ja').includes(q));
        host.querySelector('[data-inventory-count]')!.textContent=`該当 ${rows.length}件 / 表示 ${rows.length}件`;
        for(const section of sections){
          const sectionRows=rows.filter(row=>units.get(row.dataset.inventoryRow!)===section.unit);
          container.querySelector(`[data-inventory-grid="${section.unit}"]`)!.replaceChildren(...sectionRows);
          container.querySelector<HTMLElement>(`[data-inventory-section="${section.unit}"]`)!.hidden=sectionRows.length===0;
        }
        container.querySelector<HTMLElement>('[data-inventory-empty]')!.hidden=rows.length!==0;
      };
      query.addEventListener('input',()=>{state.query=query.value;draw();});
      draw();
    },
  };
}
