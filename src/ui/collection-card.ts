import type { MemberMaster, SnapMaster } from '../data/catalog/model';
import { cardTypeAccent } from '../data/catalog/card-types';
import { cardBadges } from './card-identity';

export const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Card = MemberMaster | SnapMaster;

/** Identity, ownership treatment and stages shared by editing and read-only projections. */
export function collectionCardAttributes(card: Card, owned: boolean, extra = ''): string {
  return `style="--card-color: ${cardTypeAccent(card.cardType)}" data-rarity="${card.rarity}" class="panel collection-card ${owned ? 'is-owned' : ''} ${extra}"`;
}
export function collectionCardIdentity(card: Card, owned: boolean, characters = '', readonly = false): string {
  const content = `<span class="card-meta">${cardBadges(card)}<span class="card-id">ID ${card.id}</span><span class="ownership-badge" data-owned-label>${owned ? '✓ 所持' : '未所持'}</span></span>
    <span class="card-name">${escape(card.name)}</span><span class="card-title">［${escape(card.title)}］</span>${characters ? `<span class="muted card-characters">${escape(characters)}</span>` : ''}`;
  return readonly ? `<div class="card-identity">${content}</div>` : `<button type="button" class="card-identity" data-ownership-toggle aria-pressed="${owned}" aria-label="${escape(card.name)}［${escape(card.title)}］の所持を切り替え">${content}</button>`;
}
export function editableStages(prefix: string, key: string, label: string, value: string | number, levels: number[]): string {
  return `<fieldset class="field stage-field"><legend>${label}</legend><div class="stage-options">${levels.map(level => {
    const id = `${prefix}-${key}-${level}`;
    return `<label for="${id}"><input type="radio" id="${id}" name="${key}" value="${level}" required ${String(value) === String(level) ? 'checked' : ''}><span>${level}</span></label>`;
  }).join('')}</div></fieldset>`;
}
export function projectedStages(label: string, levels: number[], current: number | undefined, target: number | undefined): string {
  return `<div class="field stage-field"><span>${label}</span><div class="stage-options stage-projection" role="list" aria-label="${label}">${levels.map(level => {
    const from = current === level, to = target === level;
    return `<span role="listitem" class="${from ? 'is-current' : ''} ${to ? 'is-target' : ''}"><b>${level}</b>${from ? '<small>現在</small>' : ''}${to ? '<small>目標</small>' : ''}</span>`;
  }).join('')}</div></div>`;
}
