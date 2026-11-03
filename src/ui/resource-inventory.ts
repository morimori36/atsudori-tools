import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { validateResourceInventory } from '../domain/materials/inventory';
import type { ResourceInventory } from '../domain/materials/inventory';
import { escape } from './collection-card';

export interface InventoryViewState { query:string; limit:number; drafts:Map<string,string> }
export function createResourceInventoryView(master:Masterdata,collection:Collection,state:InventoryViewState) {
  let inventory={...collection.resourceInventory};
  const resources=master.materialDefinition?.resources??[];
  const supported=resources.filter(r=>r.unit!=='exp');
  const unsupported=Object.entries(inventory).filter(([id])=>!supported.some(r=>r.id===id));
  return {
    html:`<section class="inventory-management"><section class="panel catalog-tools" aria-label="一覧の絞り込み"><div class="catalog-toolbar"><label class="field catalog-search"><span>素材名・IDで検索</span><input type="search" data-inventory-query value="${escape(state.query)}" placeholder="素材名を入力"></label></div><p class="muted catalog-help">変更は自動保存 · 空欄は未登録、0は在庫0 · EXPは入力対象外</p><p class="muted catalog-count" data-inventory-count role="status"></p></section>
      ${!master.materialDefinition?'<p class="warning">素材マスタ未登録です。</p>':''}<div class="catalog-grid" data-inventory-rows></div><button type="button" class="secondary" data-inventory-more>続きを表示</button>
      ${unsupported.length?`<details class="panel inventory-unsupported"><summary>参照不能・対象外の在庫（${unsupported.length}件を保持）</summary>${unsupported.map(([id,quantity])=>`<p data-inventory-unsupported="${escape(id)}">ID ${escape(id)} · 登録値 ${quantity.toLocaleString('ja-JP')} · ${resources.some(r=>r.id===id)?'EXPは在庫入力の対象外':'現在のマスタに対応する素材なし'}</p>`).join('')}</details>`:''}</section>`,
    bind(host:HTMLElement,save:(inventory:ResourceInventory)=>boolean,schedule:(id:string,save:()=>void,immediate:boolean)=>void) {
      const query=host.querySelector<HTMLInputElement>('[data-inventory-query]')!;
      const draw=()=>{
        const q=state.query.trim().normalize('NFKC').toLocaleLowerCase('ja');
        const rows=supported.filter(r=>`${r.name} ${r.id}`.normalize('NFKC').toLocaleLowerCase('ja').includes(q));
        host.querySelector('[data-inventory-count]')!.textContent=`該当 ${rows.length}件 / 表示 ${Math.min(state.limit,rows.length)}件`;
        host.querySelector('[data-inventory-rows]')!.innerHTML=rows.slice(0,state.limit).map(r=>`<article class="panel collection-card inventory-card ${Object.hasOwn(inventory,r.id)?'is-owned':''}" data-inventory-row="${escape(r.id)}"><div class="card-identity"><span class="card-meta"><span class="card-id">ID ${escape(r.id)}</span><span data-inventory-status>${Object.hasOwn(inventory,r.id)?'登録済み':'未登録'}</span></span><h2 class="card-name">${escape(r.name)}</h2></div><div><label class="field"><span>現在庫（${r.unit==='card'?'枚':'個'}）</span><input type="text" inputmode="numeric" autocomplete="off" placeholder="未登録" data-inventory-input="${escape(r.id)}" value="${escape(state.drafts.get(r.id)??inventory[r.id]??'')}" aria-label="${escape(r.name)}の現在庫"></label><p class="card-input-state" data-inventory-error role="alert"></p></div></article>`).join('')||'<p class="panel catalog-empty">条件に一致する素材がありません。</p>';
        host.querySelector<HTMLButtonElement>('[data-inventory-more]')!.hidden=state.limit>=rows.length;
        host.querySelectorAll<HTMLInputElement>('[data-inventory-input]').forEach(input=>{
          const id=input.dataset.inventoryInput!;
          const report=(message:string)=>{
            // Look up the current row: search/paging may have replaced the original node.
            const current=[...host.querySelectorAll<HTMLInputElement>('[data-inventory-input]')].find(i=>i.dataset.inventoryInput===id);
            if(!current)return;
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
            const row=[...host.querySelectorAll<HTMLElement>('[data-inventory-row]')].find(r=>r.dataset.inventoryRow===id);
            row?.classList.toggle('is-owned',Object.hasOwn(inventory,id));
            if(row)row.querySelector('[data-inventory-status]')!.textContent=Object.hasOwn(inventory,id)?'登録済み':'未登録';
          };
          input.addEventListener('input',()=>{state.drafts.set(id,input.value);report('');schedule(id,commit,false);});
          input.addEventListener('change',()=>schedule(id,commit,true));
          if(state.drafts.has(id))report('未保存の入力があります。値を確認してください。');
        });
      };
      query.addEventListener('input',()=>{state.query=query.value;state.limit=20;draw();});
      host.querySelector('[data-inventory-more]')!.addEventListener('click',()=>{state.limit+=20;draw();});
      draw();
    },
  };
}
