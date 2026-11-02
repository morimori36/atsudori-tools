import { bondTheoryFixture } from './bond-theory';

/** Independently designed two bands with different sizes, scrambled IDs and gapped orders. */
export function displayOrderFixture() {
  const { master, collection } = bondTheoryFixture();
  master.bands.push({ id: 8197, name: '架空の折り紙楽団' });
  master.characters = [
    { id: 8297, bandId: 8101, name: '架空の白紙', displayOrder: 40 },
    { id: 8201, bandId: 8101, name: '架空の青紙', displayOrder: 70 },
    { id: 8262, bandId: 8101, name: '架空の赤紙', displayOrder: 0 },
    { id: 8284, bandId: 8101, name: '架空の緑紙', displayOrder: 20 },
    { id: 8239, bandId: 8101, name: '架空の黄紙', displayOrder: 10 },
    { id: 8328, bandId: 8197, name: '架空の丸紙', displayOrder: 70 },
    { id: 8314, bandId: 8197, name: '架空の角紙', displayOrder: 0 },
    { id: 8306, bandId: 8197, name: '架空の星紙', displayOrder: 40 },
  ];
  const item = master.bandItems[0]!, effect = master.bandItemEffects[0]!;
  for (const id of [8698, 8692, 8696, 8694]) {
    master.bandItems.push({ ...item, id, name: `架空小道具${id}` });
    master.bandItemLevels.push({ itemId: id, level: 1 });
    master.bandItemEffects.push({ ...effect, itemId: id });
  }
  master.bandItems.push({ ...item, id: 8699, bandId: 8197 });
  master.bandItemLevels.push({ itemId: 8699, level: 1 });
  master.skillTargets.push({ ...master.skillTargets[0]!, id: 8799, bandId: 8197 });
  master.bandItemEffects.push({ ...effect, itemId: 8699, targetIds: [8799] });
  const template = master.members[0]!, owned = collection.members[0]!;
  master.members = master.characters.map((c, i) => ({ ...template, id: 8890 + i, characterId: c.id }));
  collection.members = master.members.map(m => ({ ...owned, cardId: m.id }));
  master.snaps[0]!.characterIds = [8201, 8239, 8297, 8262, 8284];
  return { master, collection };
}
