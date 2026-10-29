import { requireInteger } from '../rating/calculate';
import { maximumAssignment } from './maximum-assignment';
import { selectionRarityPriority, usesProvisionalRarity, provisionalRarityNotice } from './rarity';

export interface MemberCandidate { id: number; bandId: number; characterId: number; cardType: number; rarity: number }
export interface SnapCandidate { id: number; characterIds: readonly number[]; cardType: number; rarity: number; /** Derived from owned Lv/U, never persisted. */ scoreBp: number }
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
function choose<T extends { id: number; rarity: number }>(candidates: readonly T[], policy: CollisionPolicy): Choice<T> {
  if (!candidates.length) return { status: 'none' };
  if (candidates.length === 1) return { status: 'selected', candidate: candidates[0]!, provisional: false };
  const result = policy.contenders(candidates);
  if (!result.candidates.length || result.candidates.some(c => !candidates.includes(c))) throw new Error(`invalid collision policy ${policy.id}`);
  if (result.candidates.length === 1) return { status: 'selected', candidate: result.candidates[0]!, provisional: false };
  if (result.reason !== 'equal-rarity') return { status: 'ambiguous', candidates: result.candidates, reason: result.reason };
  return { status: 'selected', candidate: [...result.candidates].sort(provisionalCardOrder)[0]!, provisional: true };
}
export const snapScoreNotice = 'Snapはバンド・色ごとのSnap実効補正合計最大化（仮説E）で選出する試験仕様です。同点ID順も含め実機観測からの暫定仮説で、ゲーム内仕様は未確定です。';
export interface SelectedSlot {
  characterId: number;
  member: Choice<MemberCandidate>;
  snap: Choice<SnapCandidate>;
  issues: { code: 'unknown-recipient-order'; snapId: number; characterIds: number[] }[];
  notices: string[];
  allocationReason?: string;
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

/** Member selection is unchanged; optimize only Snap assignments within each band/color. */
export function selectByColor(
  members: readonly MemberCandidate[], snaps: readonly SnapCandidate[],
  policy: CollisionPolicy = provisionalHigherRarity,
): ColorSelection[] {
  if (new Set(members.map(m => m.id)).size !== members.length || new Set(snaps.map(s => s.id)).size !== snaps.length) {
    throw new Error('duplicate owned card identities');
  }
  for (const snap of snaps) requireInteger(snap.scoreBp, 'Snap scoreBp');
  const groups = [...new Set(members.map(m => `${m.bandId}:${m.cardType}`))]
    .map(key => key.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return groups.map(([bandId, cardType]) => {
    const matching = members.filter(m => m.bandId === bandId && m.cardType === cardType);
    const slots: SelectedSlot[] = [];
    for (const characterId of [...new Set(matching.map(m => m.characterId))].sort((a, b) => a - b)) {
      const characterMembers = matching.filter(m => m.characterId === characterId);
      let candidates = [...characterMembers].sort(provisionalCardOrder);
      // Trial rule: three independent cards per character/color, regardless of equal rarity.
      // Reuse the policy for each seat so unknown rarity orders still remain pending.
      for (let seat = 0; seat < 3 && candidates.length; seat++) {
        const member = choose(candidates, policy);
        const notices = member.status === 'selected' && member.provisional ? [equalRarityNotice] : [];
        if (characterMembers.length > 1) notices.push('同一キャラクター・同色はメンバーとSnapを各最大3枚とする試験仕様です。');
        if (candidates.some(c => usesProvisionalRarity(c.rarity))) notices.push(provisionalRarityNotice);
        slots.push({ characterId, member, snap: { status: 'none' }, issues: [], notices,
          status: member.status === 'ambiguous' ? 'ambiguous' : 'resolved' });
        if (member.status !== 'selected') break;
        candidates = candidates.filter(c => c.id !== member.candidate.id);
      }
    }
    const allocation = slots.flatMap(slot => slot.member.status === 'selected' ? [{slot, member:slot.member.candidate}] : [])
      .sort((a, b) => provisionalCardOrder(a.member, b.member));
    const candidates = [...snaps].filter(s => s.cardType === cardType && allocation.some(({member}) => s.characterIds.includes(member.characterId)))
      .sort(provisionalCardOrder);
    const pending = slots.some(slot => slot.member.status !== 'selected');
    // Hypothesis E: only owned Snap effective scores determine the assignment.
    // Incompatible edges are forbidden; no-Snap dummy columns have score zero.
    const weights = allocation.map(({member}) => [
      ...candidates.map(snap => snap.characterIds.includes(member.characterId) ? snap.scoreBp : null),
      ...allocation.map(() => 0),
    ]);
    if (pending) {
      for (const slot of slots) {
        slot.status = slot.member.status === 'ambiguous' ? 'ambiguous' : 'unresolved';
        slot.allocationReason = 'バンド・色内のメンバー選出が未確定のためSnap割り当てを保留しています';
      }
    } else {
      const assignment = maximumAssignment(weights);
      for (const [i, {slot}] of allocation.entries()) {
        const snap = candidates[assignment[i]!];
        slot.snap = snap ? { status: 'selected', candidate: snap, provisional: true } : { status: 'none' };
        slot.notices.push(snapScoreNotice);
      }
    }
    const status = slots.some(s => s.status === 'unresolved') ? 'unresolved' : slots.some(s => s.status === 'ambiguous') ? 'ambiguous' : 'resolved';
    return { bandId, cardType, collisionPolicy: policy.id, slots, status };
  });
}
