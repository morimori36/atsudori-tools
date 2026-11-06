export const materialAxes = ['trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel','level','rank'] as const;
export type MaterialAxis = typeof materialAxes[number];
export type CardKind = 'member' | 'snap';
export interface MaterialAmount { resourceId: string; quantity: number }
export interface MaterialResource { id: string; name: string; unit: 'item' | 'card' | 'exp'; displayOrder?: number }
export interface MaterialSchedule {
  id: string;
  axis: MaterialAxis;
  mode: 'steps' | 'cumulative' | 'unsupported';
  basis: string;
  reason?: string;
  stages: { stage: number; amounts: MaterialAmount[] }[];
}
export interface MaterialDefinition {
  catalogRevision: string;
  resources: MaterialResource[];
  schedules: MaterialSchedule[];
  bindings: { kind: CardKind; cardId: number; axis: MaterialAxis; scheduleId: string }[];
}
