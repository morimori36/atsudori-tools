import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from '../storage/collection';
import type { Collection } from '../storage/collection';

/** null preserves the current value; numbers select the greatest legal value <= target. */
export type GrowthTarget = null | number | 'max';
export interface TrainingConditions {
  member: {
    trainingStage: GrowthTarget;
    awakeningStage: GrowthTarget;
    liveSkillLevel: GrowthTarget;
    gekisouSkillLevel: GrowthTarget;
    /** Compatibility mode for v1 hypothetical settings; ordinary max always reaches the cap. */
    level: GrowthTarget | 'maxIfTrainingRaised';
  };
  snap: { rank: GrowthTarget; level: GrowthTarget };
}
export const KEEP_TRAINING: Readonly<TrainingConditions> = Object.freeze({
  member: Object.freeze({trainingStage:null, awakeningStage:null, liveSkillLevel:null, gekisouSkillLevel:null, level:null}),
  snap: Object.freeze({rank:null, level:null}),
});
export const MAXIMUM_TRAINING: Readonly<TrainingConditions> = Object.freeze({
  member: Object.freeze({trainingStage:'max', awakeningStage:null, liveSkillLevel:'max', gekisouSkillLevel:'max', level:'max'}),
  snap: Object.freeze({rank:null, level:'max'}),
});

export function validateTrainingConditions(value: unknown): TrainingConditions {
  const read = (value: unknown, keys: string[]): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('育成条件が不正です');
    const r = value as Record<string, unknown>;
    if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r,k))) throw new Error('育成条件が不正です');
    return r;
  };
  const root = read(value, ['member','snap']);
  const member = read(root.member, Object.keys(KEEP_TRAINING.member));
  const snap = read(root.snap, Object.keys(KEEP_TRAINING.snap));
  for (const [group, r] of [['member',member],['snap',snap]] as const) for (const [key,v] of Object.entries(r)) {
    if (v === null || v === 'max' || (group === 'member' && key === 'level' && v === 'maxIfTrainingRaised')) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw new Error('育成条件が不正です');
  }
  return {member:{...member},snap:{...snap}} as unknown as TrainingConditions;
}

function raise(current: number, target: GrowthTarget, legal: number[]): number {
  if (target === null) return current;
  if (!legal.length) throw new Error('合法な育成段階を確定できません');
  return Math.max(current, ...legal.filter(n => target === 'max' || n <= target));
}

/** The single projection boundary. Returns detached, validated ownership without changing the catalog. */
export function applyTrainingConditions(master: Masterdata, input: Collection, supplied: TrainingConditions): Collection {
  const settings = validateTrainingConditions(supplied);
  const target = validateCollection(input, master);
  target.members = target.members.map(owned => {
    const card = master.members.find(c => c.id === owned.cardId)!;
    const trainingStage = raise(owned.trainingStage, settings.member.trainingStage,
      master.memberTraining.filter(r => r.group === card.trainingGroup).map(r => r.stage));
    const cap = master.memberLevelLimits.find(r => r.rarity === card.rarity && r.trainingStage === trainingStage);
    if (!cap) throw new Error('メンバーの合法Lv上限を確定できません');
    const levelTarget = settings.member.level === 'maxIfTrainingRaised'
      ? (trainingStage > owned.trainingStage ? 'max' : null) : settings.member.level;
    return {...owned, trainingStage,
      level: raise(owned.level, levelTarget, master.memberLevels.filter(r => r.group === card.levelGroup && r.level <= cap.limitLevel).map(r => r.level)),
      awakeningStage: raise(owned.awakeningStage, settings.member.awakeningStage, master.memberAwakening.filter(r => r.group === card.awakeningGroup).map(r => r.stage)),
      liveSkillLevel: raise(owned.liveSkillLevel, settings.member.liveSkillLevel, card.liveSkillLevels),
      gekisouSkillLevel: raise(owned.gekisouSkillLevel, settings.member.gekisouSkillLevel, card.gekisouSkillLevels)};
  });
  target.snaps = target.snaps.map(owned => {
    const card = master.snaps.find(c => c.id === owned.supportCardId)!;
    const ranks = master.snapRanks.filter(r => r.group === card.rankGroup);
    const rank = raise(owned.rank, settings.snap.rank, ranks.map(r => r.rank));
    const cap = ranks.find(r => r.rank === rank);
    if (!cap) throw new Error('スナップの合法Lv上限を確定できません');
    return {...owned,rank,level:raise(owned.level, settings.snap.level,
      master.snapLevels.filter(r => r.group === card.levelGroup && r.level <= cap.limitLevel).map(r => r.level))};
  });
  return validateCollection(target, master);
}
