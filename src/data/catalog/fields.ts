export type FieldKind = 'integer' | 'zeroInteger' | 'text' | 'ids' | 'pair' | 'stats';
export const tableFields = {
  bands: { id: 'integer', name: 'text' },
  characters: { id: 'integer', bandId: 'integer', name: 'text' },
  members: { id: 'integer', characterId: 'integer', cardType: 'integer', rarity: 'integer', name: 'text', title: 'text', maxStats: 'stats', levelGroup: 'integer', trainingGroup: 'integer', awakeningGroup: 'integer', liveSkillLevels: 'ids', gekisouSkillLevels: 'ids' },
  snaps: { id: 'integer', characterIds: 'ids', cardType: 'integer', rarity: 'integer', name: 'text', title: 'text', maxPercentBp: 'stats', levelGroup: 'integer', rankGroup: 'integer' },
  characterRankLevels: { value: 'integer' },
  memberLevels: { group: 'integer', level: 'integer', rates: 'stats' },
  memberTraining: { group: 'integer', stage: 'integer', rates: 'stats' },
  memberAwakening: { group: 'integer', stage: 'integer', rates: 'stats', leaderSkillLevel: 'integer' },
  memberLevelLimits: { rarity: 'integer', trainingStage: 'integer', limitLevel: 'integer' },
  snapLevels: { group: 'integer', level: 'integer', rates: 'stats' },
  snapRanks: { group: 'integer', rank: 'integer', limitLevel: 'integer', supportSkillLevels: 'pair' },
  bandItems: { id: 'integer', bandId: 'integer', name: 'text' },
  bandItemLevels: { itemId: 'integer', level: 'integer' },
  bandItemEffects: { itemId: 'integer', level: 'integer', effectType: 'integer', valueBp: 'zeroInteger', targetIds: 'ids' },
  skillTargets: { id: 'integer', targetType: 'integer', bandId: 'integer', characterId: 'zeroInteger', cardType: 'zeroInteger', tagId: 'zeroInteger' },
} as const satisfies Record<string, Record<string, FieldKind>>;
export type CatalogTable = keyof typeof tableFields;
export const tableLabels: Record<CatalogTable, string> = {
  bands: 'バンド', characters: 'キャラクター', members: 'メンバーカード', snaps: 'Snap',
  characterRankLevels: 'キャラランクの合法値', memberLevels: 'メンバーLv率',
  memberTraining: '特訓率', memberAwakening: '覚醒率', memberLevelLimits: 'メンバーLv上限',
  snapLevels: 'Snap Lv率', snapRanks: 'Snap上限解放',
  bandItems: 'バンドアイテム', bandItemLevels: 'アイテムLv', bandItemEffects: 'アイテム効果', skillTargets: '効果対象',
};
export const tableKeys: Record<CatalogTable, string[]> = {
  bands: ['id'], characters: ['id'], members: ['id'], snaps: ['id'], characterRankLevels: ['value'],
  memberLevels: ['group','level'], memberTraining: ['group','stage'], memberAwakening: ['group','stage'],
  memberLevelLimits: ['rarity','trainingStage'], snapLevels: ['group','level'], snapRanks: ['group','rank'],
  bandItems: ['id'], bandItemLevels: ['itemId','level'], bandItemEffects: ['itemId','level'], skillTargets: ['id'],
};
