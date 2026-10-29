import { syntheticCatalog, syntheticCollection } from './synthetic';

/** Four invented same-character cards; no observed game rows or holdings. */
export function multiMemberFixture() {
  const master = syntheticCatalog(), collection = syntheticCollection(master);
  master.members = [4, 3, 2, 2].map((rarity, i) => ({ ...master.members[0]!, id: 8301 + i, rarity, title: `架空の独立カード${i + 1}` }));
  master.memberLevelLimits = [2, 3, 4].flatMap(rarity => [
    { rarity, trainingStage: 1, limitLevel: 1 }, { rarity, trainingStage: 2, limitLevel: 2 },
  ]);
  master.snaps = [0, 1, 2, 3].map(i => ({ ...master.snaps[0]!, id: 8501 + i, title: `架空の独立Snap${i + 1}` }));
  collection.members = master.members.map(m => ({ ...collection.members[0]!, cardId: m.id }));
  return { master, collection };
}
