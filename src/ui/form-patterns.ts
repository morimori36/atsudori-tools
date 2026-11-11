const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]!);
interface Control { id: string; name: string; label: string; help?: string }
const describedBy = (control: Control): string => control.help ? `aria-describedby="${esc(control.id)}-help"` : '';
const help = (control: Control): string => control.help ? `<small class="ui-help" id="${esc(control.id)}-help">${esc(control.help)}</small>` : '';
/** Presentation only: callers own validation, persistence and business rules. */
export function uiNumberField(control: Control & {value: number | null; min: number; max?: number}): string {
  return `<div class="field ui-field"><label for="${esc(control.id)}">${esc(control.label)}</label><input id="${esc(control.id)}" name="${esc(control.name)}" type="number" inputmode="numeric" min="${control.min}" ${control.max === undefined ? '' : `max="${control.max}"`} step="1" placeholder="未確認" value="${esc(control.value ?? '')}" ${describedBy(control)}>${help(control)}</div>`;
}
export function uiCheckbox(control: Control & {checked: boolean}): string {
  return `<div class="ui-choice-block"><label class="ui-choice" for="${esc(control.id)}"><input id="${esc(control.id)}" type="checkbox" name="${esc(control.name)}" ${control.checked ? 'checked' : ''} ${describedBy(control)}><span>${esc(control.label)}</span></label>${help(control)}</div>`;
}
