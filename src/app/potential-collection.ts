import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';

/** A display-only projection. Ownership, awakening, Snap growth and unknown inputs stay intact. */
export function potentialCollection(master: Masterdata, collection: Collection): Collection {
  return { ...collection, members: collection.members.map(owned => {
    const row = master.members.find(m => m.id === owned.cardId);
    if (!row) throw new Error(`unknown member ${owned.cardId}`);
    const stages = master.memberTraining.filter(t => t.group === row.trainingGroup).map(t => t.stage);
    if (!stages.length || !row.liveSkillLevels.length || !row.gekisouSkillLevels.length) {
      throw new Error(`missing growth limits for member ${owned.cardId}`);
    }
    const trainingStage = Math.max(...stages);
    const limit = master.memberLevelLimits.find(l => l.rarity === row.rarity && l.trainingStage === trainingStage);
    if (!limit || !master.memberLevels.some(l => l.group === row.levelGroup && l.level === limit.limitLevel)) {
      throw new Error(`missing level limit for member ${owned.cardId}`);
    }
    return { ...owned, trainingStage, level: limit.limitLevel,
      liveSkillLevel: Math.max(...row.liveSkillLevels), gekisouSkillLevel: Math.max(...row.gekisouSkillLevels) };
  }) };
}
