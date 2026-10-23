// SRC-016: comparison policy only. Preserve raw rarity for metadata and growth.
export const selectionRarityPriority = (rarity: number): number | undefined =>
  ({ 2: 2, 3: 3, 4: 4, 10: 4, 20: 3 } as Record<number, number>)[rarity];
export const usesProvisionalRarity = (rarity: number): boolean => rarity === 10 || rarity === 20;
export const provisionalRarityNotice = 'EXはSSR、BDはSR相当として扱う暫定対応です。';
