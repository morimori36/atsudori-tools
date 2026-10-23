import { selectionRarityPriority, usesProvisionalRarity, provisionalRarityNotice } from './rarity';

export interface MemberCandidate { id: number; bandId: number; characterId: number; cardType: number; rarity: number }
export interface SnapCandidate { id: number; characterIds: readonly number[]; cardType: number; rarity: number }
export type Choice<T> =
  | { status: 'selected'; candidate: T; provisional: boolean }
  | { status: 'none' }
  | { status: 'ambiguous'; candidates: readonly T[]; reason: string };
export interface CollisionPolicy {
  id: string;
  contenders<T extends { rarity: number }>(candidates: readonly T[]): { candidates: readonly T[]; reason: string };
}
/** SRC-016 provisionally treats EX as SSR and BD as SR. Other unknown codes stay unknown. */
export const provisionalHigherRarity: CollisionPolicy = {
  id: 'higher-rarity-with-provisional-ex-bd-and-id-ties',
  contenders(candidates) {
    if (new Set(candidates.map(c => c.rarity)).size > 1 && candidates.some(c => selectionRarityPriority(c.rarity) === undefined)) {
      return { candidates, reason: 'unknown-rarity-order' };
    }
    const priority = (rarity: number) => selectionRarityPriority(rarity) ?? rarity;
    const highest = Math.max(...candidates.map(c => priority(c.rarity)));
    return { candidates: candidates.filter(c => priority(c.rarity) === highest), reason: 'equal-rarity' };
  },
};
// Isolated application tie order; replace when the game's order is observed.
const provisionalCardOrder = (a: { id: number }, b: { id: number }): number => a.id - b.id;
const provisionalRecipientOrder = (a: MemberCandidate, b: MemberCandidate): number =>
  a.characterId - b.characterId || provisionalCardOrder(a, b);
function choose<T extends { id: number; rarity: number }>(candidates: readonly T[], policy: CollisionPolicy): Choice<T> {
  if (!candidates.length) return { status: 'none' };
  if (candidates.length === 1) return { status: 'selected', candidate: candidates[0]!, provisional: false };
  const result = policy.contenders(candidates);
  if (!result.candidates.length || result.candidates.some(c => !candidates.includes(c))) throw new Error(`invalid collision policy ${policy.id}`);
  if (result.candidates.length === 1) return { status: 'selected', candidate: result.candidates[0]!, provisional: false };
  if (result.reason !== 'equal-rarity') return { status: 'ambiguous', candidates: result.candidates, reason: result.reason };
  return { status: 'selected', candidate: [...result.candidates].sort(provisionalCardOrder)[0]!, provisional: true };
}
export interface SelectedSlot {
  characterId: number;
  member: Choice<MemberCandidate>;
  snap: Choice<SnapCandidate>;
  issues: { code: 'unknown-recipient-order'; snapId: number; characterIds: number[] }[];
  notices: string[];
  status: 'resolved' | 'ambiguous' | 'unresolved';
}
export interface ColorSelection {
  bandId: number;
  cardType: number;
  collisionPolicy: string;
  slots: SelectedSlot[];
  status: 'resolved' | 'ambiguous' | 'unresolved';
}
export const equalRarityNotice = '同レアリティの重複は暫定順で選出しています。ゲーム内の選出順は未確認です。';

/** Band → color → character. Greedy rarity-first allocation, never rating optimization. */
export function selectByColor(
  members: readonly MemberCandidate[], snaps: readonly SnapCandidate[], policy: CollisionPolicy = provisionalHigherRarity,
): ColorSelection[] {
  if (new Set(members.map(m => m.id)).size !== members.length || new Set(snaps.map(s => s.id)).size !== snaps.length) {
    throw new Error('duplicate owned card identities');
  }
  const groups = [...new Set(members.map(m => `${m.bandId}:${m.cardType}`))]
    .map(key => key.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return groups.map(([bandId, cardType]) => {
    const matching = members.filter(m => m.bandId === bandId && m.cardType === cardType);
    const slots: SelectedSlot[] = [...new Set(matching.map(m => m.characterId))].sort((a, b) => a - b).map(characterId => {
      const candidates = matching.filter(m => m.characterId === characterId);
      const member = choose(candidates, policy);
      const notices = member.status === 'selected' && member.provisional ? [equalRarityNotice] : [];
      if (candidates.some(c => usesProvisionalRarity(c.rarity))) notices.push(provisionalRarityNotice);
      return { characterId, member, snap: { status: 'none' }, issues: [],
        notices,
        status: member.status === 'ambiguous' ? 'ambiguous' : 'resolved' };
    });
    const eligible = (slot: SelectedSlot) => snaps.filter(s => s.cardType === cardType && s.characterIds.includes(slot.characterId));
    // Unknown member orders must not silently give a shared Snap to another recipient.
    for (const snap of snaps.filter(s => s.cardType === cardType)) {
      const recipients = slots.filter(s => snap.characterIds.includes(s.characterId));
      if (recipients.length < 2) continue;
      const resolved = recipients.flatMap(s => s.member.status === 'selected' ? [s.member.candidate] : []);
      if (resolved.some(c => usesProvisionalRarity(c.rarity))) {
        for (const slot of recipients) if (!slot.notices.includes(provisionalRarityNotice)) slot.notices.push(provisionalRarityNotice);
      }
      const order = resolved.length === recipients.length ? policy.contenders(resolved) : undefined;
      if (!order || order.reason === 'unknown-rarity-order' || (order.candidates.length > 1 && order.reason !== 'equal-rarity')) {
        for (const slot of recipients) {
          slot.issues.push({ code: 'unknown-recipient-order', snapId: snap.id, characterIds: recipients.map(s => s.characterId) });
          slot.status = 'unresolved';
        }
      } else if (order.candidates.length > 1) {
        for (const slot of recipients.filter(s => s.member.status === 'selected' && order.candidates.includes(s.member.candidate))) {
          if (!slot.notices.includes(equalRarityNotice)) slot.notices.push(equalRarityNotice);
        }
      }
      if (recipients.some(s => eligible(s).length > 1)) {
        const notice = '複数候補のSnap割当は、高レアリティのメンバーから順に処理する暫定対応です。';
        for (const slot of recipients) if (!slot.notices.includes(notice)) slot.notices.push(notice);
      }
    }
    const used = new Set<number>(); // Scoped to this band/color; never shared across bands.
    const allocation = slots.filter(s => s.status === 'resolved' && s.member.status === 'selected').sort((a, b) => {
      const am = a.member.status === 'selected' ? a.member.candidate : undefined;
      const bm = b.member.status === 'selected' ? b.member.candidate : undefined;
      return ((selectionRarityPriority(bm!.rarity) ?? 0) - (selectionRarityPriority(am!.rarity) ?? 0)) || provisionalRecipientOrder(am!, bm!);
    });
    for (const slot of allocation) {
      const candidates = eligible(slot).filter(s => !used.has(s.id));
      if (candidates.some(c => usesProvisionalRarity(c.rarity)) && !slot.notices.includes(provisionalRarityNotice)) slot.notices.push(provisionalRarityNotice);
      slot.snap = choose(candidates, policy);
      if (slot.snap.status === 'ambiguous') slot.status = 'ambiguous';
      if (slot.snap.status === 'selected') {
        used.add(slot.snap.candidate.id);
        if (slot.snap.provisional && !slot.notices.includes(equalRarityNotice)) slot.notices.push(equalRarityNotice);
      }
    }
    const status = slots.some(s => s.status === 'unresolved') ? 'unresolved' : slots.some(s => s.status === 'ambiguous') ? 'ambiguous' : 'resolved';
    return { bandId, cardType, collisionPolicy: policy.id, slots, status };
  });
}
