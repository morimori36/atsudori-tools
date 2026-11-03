import { cardTypeAccent, cardTypeName } from '../data/catalog/card-types';

type CardIdentity = { rarity: number; cardType: number; name: string; title: string };
const escape = (value: string): string => value.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const rarity = (value: number): string => ({ 2: 'R', 3: 'SR', 4: 'SSR', 10: 'EX', 20: 'BD' } as Record<number, string>)[value] ?? `レアリティ${value}`;

/** Use catalog metadata, including neutral labels for unknown codes. */
export function cardBadges(card: Pick<CardIdentity, 'rarity' | 'cardType'>): string {
  return `<span class="card-badges" style="--card-color: ${cardTypeAccent(card.cardType)}"><span class="rarity-badge" data-rarity="${card.rarity}">${rarity(card.rarity)}</span><span class="card-type-label">${cardTypeName(card.cardType)}</span></span>`;
}

/** Only for individual cards; character and band names stay unadorned. */
export function cardIdentity(card: CardIdentity): string {
  return `<span class="card-reference">${cardBadges(card)} ${escape(card.name)}［${escape(card.title)}］</span>`;
}
