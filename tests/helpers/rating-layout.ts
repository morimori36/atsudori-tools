import { displayOrderFixture } from './display-order';

/** Independent paper players, with multiple colors, two bands and one unresolved color. */
export function ratingLayoutFixture() {
  const { master, collection } = displayOrderFixture();
  const originals = master.members.filter(member => [8262, 8239].includes(member.characterId));
  for (const [index, original] of originals.entries()) {
    const id = 8970 + index;
    master.members.push({ ...original, id, cardType: 8, title: '架空の折り目' });
    collection.members.push({ ...collection.members.find(member => member.cardId === original.id)!, cardId: id });
    collection.characterRanks[original.characterId] = 2;
  }
  collection.bandItems = { 8601: 1, 8692: 1, 8694: 1, 8696: 1, 8698: 1 };
  return { master, collection };
}
