import type { Collection } from '../storage/collection';
import type { MaterialRequirements } from '../domain/materials/calculate';
import { materialInventoryBalances,validateResourceInventory } from '../domain/materials/inventory';
import type { InventoryBalance,ResourceInventory } from '../domain/materials/inventory';
import { openDialog } from './dialog';
const escape=(v:unknown):string=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const number=(n:number)=>n.toLocaleString('ja-JP');
const unit=(row:InventoryBalance)=>row.resource.unit==='card'?'枚':row.resource.unit==='exp'?'EXP（上限）':'個';
function shortage(row:InventoryBalance):string {
  if(row.stock===null)return '在庫未登録・不足数未算出';
  if(row.incomplete)return row.shortage!>0?`少なくとも ${number(row.shortage!)} ${unit(row)}不足`:'不足数未確定（必要量に未計算項目あり）';
  return `${number(row.shortage!)} ${unit(row)}`;
}
export function createResourceInventoryView(collection:Collection,requirements:MaterialRequirements) {
  let inventory={...collection.resourceInventory};
  const current=()=>materialInventoryBalances(requirements,inventory);
  const renderTotals=()=>{
    const {balances,unsupported}=current();
    return `<button type="button" class="secondary" data-inventory-open>素材在庫を編集</button>
      <p class="muted">在庫は素材ごとに全用途で共有します。仮想の育成では消費しません。理論EXPの実現可能性は判定しません。</p>
      ${unsupported.length?`<p class="warning">未対応・参照不能の在庫 ${unsupported.length}件を保持しています。在庫編集で確認できます。</p>`:''}
      <div class="inventory-totals" data-inventory-totals><h3>全体の必要量・在庫・不足数</h3>${balances.filter(r=>r.required>0).map(row=>`<section class="inventory-total" data-inventory-resource="${escape(row.resource.id)}"><h4>${escape(row.resource.name)}</h4><dl><div><dt>全体必要量${row.incomplete?'（計算済み小計）':''}</dt><dd>${number(row.required)} ${unit(row)}</dd></div>${row.resource.unit==='exp'?'<div><dt>在庫・不足数</dt><dd>対象外</dd></div>':`<div><dt>現在庫</dt><dd>${row.stock===null?'未登録':`${number(row.stock)} ${unit(row)}`}</dd></div><div><dt>全体不足量</dt><dd>${shortage(row)}</dd></div>`}</dl></section>`).join('')||`<p>${requirements.incomplete?'必要量は未確定です。':'追加の必要量なし'}</p>`}</div>`;
  };
  return {
    html:renderTotals(),
    bind(host:HTMLElement,rerender:()=>void,save:(inventory:ResourceInventory)=>boolean) {
      host.querySelector('[data-inventory-open]')?.addEventListener('click',()=>{
        const dialog=document.createElement('dialog');dialog.className='training-dialog inventory-dialog';dialog.setAttribute('aria-labelledby','inventory-dialog-title');
        dialog.innerHTML=`<h2 id="inventory-dialog-title">素材在庫を編集</h2><p class="muted">空欄は未登録、0は明示的な在庫0です。個・枚の素材だけを登録します。EXP（上限）は対象外です。入力は「在庫を保存」で反映します。</p>
          <div class="inventory-filters"><label>素材名・IDで検索<input type="search" data-inventory-query></label><label>表示範囲<select data-inventory-scope><option value="required">現在の必要素材</option><option value="all">すべての対応素材</option><option value="unsupported">未対応・参照不能の在庫</option></select></label><label>在庫の絞り込み<select data-inventory-filter><option value="">すべて</option><option value="unknown">未登録のみ</option><option value="shortage">不足あり（確定分）</option></select></label></div>
          <p class="muted">必要素材を優先し20件ずつ表示します。マスタで参照できないIDや対象外の単位の在庫も削除せずバックアップに保持します。</p><p data-inventory-count role="status"></p><div data-inventory-rows></div><button type="button" class="secondary" data-inventory-more>続きを表示</button><p data-inventory-error role="alert"></p><p data-inventory-message role="status"></p><div class="training-dialog-actions"><button type="button" class="secondary" data-inventory-close>閉じる</button><button type="button" class="primary" data-inventory-save>在庫を保存</button></div>`;
        const drafts=new Map<string,string>();let limit=20;
        const draw=()=>{
          const {balances,unsupported}=current();
          const query=dialog.querySelector<HTMLInputElement>('[data-inventory-query]')!.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
          const scope=dialog.querySelector<HTMLSelectElement>('[data-inventory-scope]')!.value;
          const filter=dialog.querySelector<HTMLSelectElement>('[data-inventory-filter]')!.value;
          const text=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('ja').includes(query);
          const rows=balances.filter(r=>r.resource.unit!=='exp'&&(scope==='all'||r.required>0)&&text(`${r.resource.name} ${r.resource.id}`)
            &&(!filter||(filter==='unknown'?r.stock===null:(r.shortage??0)>0)))
            .sort((a,b)=>Number(b.required>0)-Number(a.required>0)||a.resource.name.localeCompare(b.resource.name,'ja')||a.resource.id.localeCompare(b.resource.id));
          const orphaned=unsupported.filter(r=>text(r.id));
          const count=scope==='unsupported'?orphaned.length:rows.length;
          dialog.querySelector('[data-inventory-count]')!.textContent=`該当 ${count}件 / 表示 ${Math.min(limit,count)}件`;
          dialog.querySelector('[data-inventory-rows]')!.innerHTML=scope==='unsupported'?orphaned.slice(0,limit).map(r=>`<article class="inventory-row" data-inventory-unsupported="${escape(r.id)}"><h3>ID ${escape(r.id)}</h3><p>登録値 ${number(r.quantity)} · ${escape(r.reason)}</p></article>`).join(''):
            rows.slice(0,limit).map(row=>`<article class="inventory-row" data-inventory-row="${escape(row.resource.id)}"><h3>${escape(row.resource.name)}</h3><p class="muted">ID ${escape(row.resource.id)} · 必要量${row.incomplete?'（計算済み小計）':''} ${number(row.required)} ${unit(row)} · 不足量 ${shortage(row)}</p><label>現在庫（${unit(row)}）<input type="text" inputmode="numeric" autocomplete="off" data-inventory-input="${escape(row.resource.id)}" value="${escape(drafts.get(row.resource.id)??row.stock??'')}" aria-label="${escape(row.resource.name)}の現在庫"></label></article>`).join('');
          if(!count)dialog.querySelector('[data-inventory-rows]')!.innerHTML='<p>条件に一致する素材がありません。「すべての対応素材」や検索を利用してください。</p>';
          dialog.querySelector<HTMLButtonElement>('[data-inventory-more]')!.hidden=limit>=count;
          dialog.querySelectorAll<HTMLInputElement>('[data-inventory-input]').forEach(input=>input.addEventListener('input',()=>{
            drafts.set(input.dataset.inventoryInput!,input.value);
            dialog.querySelector('[data-inventory-message]')!.textContent='入力中・在庫はまだ保存していません。';
          }));
        };
        dialog.querySelectorAll('.inventory-filters input,.inventory-filters select').forEach(control=>control.addEventListener(control.matches('[type=search]')?'input':'change',()=>{limit=20;draw();}));
        dialog.querySelector('[data-inventory-more]')!.addEventListener('click',()=>{limit+=20;draw();});
        dialog.querySelector('[data-inventory-save]')!.addEventListener('click',()=>{
          const error=dialog.querySelector('[data-inventory-error]')!;error.textContent='';
          const next={...inventory};
          for(const [id,value] of drafts) {
            const raw=value.trim();
            if(raw===''){delete next[id];continue;}
            if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))) {
              error.textContent='在庫は0以上の安全な整数を入力してください。空欄で未登録に戻せます。';return;
            }
            next[id]=Number(raw);
          }
          try {validateResourceInventory(next);}catch {error.textContent='素材在庫が不正です。登録件数・値を確認してください。';return;}
          if(!save(next)){error.textContent='在庫を保存できませんでした。登録内容は変更していません。';return;}
          inventory=next;drafts.clear();rerender();draw();dialog.querySelector('[data-inventory-message]')!.textContent='在庫を保存しました';
        });
        dialog.querySelector('[data-inventory-close]')!.addEventListener('click',()=>dialog.close());
        draw();openDialog(dialog,()=>host.querySelector<HTMLElement>('[data-inventory-open]'),dialog.querySelector<HTMLElement>('[data-inventory-query]'));
      });
    },
  };
}
