/** Keep native modal semantics while making Escape consistent even in search fields. */
export function openDialog(dialog:HTMLDialogElement,returnFocus:()=>HTMLElement|null,initial:HTMLElement|null):void {
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();dialog.close();return;}
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),summary,a[href]')].filter(e=>e.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  dialog.addEventListener('close',()=>{dialog.remove();returnFocus()?.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();initial?.focus();
}
