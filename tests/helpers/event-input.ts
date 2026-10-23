import { defaultEventInput } from '../../src/domain/event-planner/model';
import type { EventPlannerInput } from '../../src/domain/event-planner/model';

// Numeric acceptance case from the implementation specification. All labels are invented.
export function exampleEventInput(): EventPlannerInput {
  return {
    ...defaultEventInput(),
    normal: [{ name: '架空の通常アルファ', enabled: true, rank: 'S', bonus: 12 }, { name: '架空の通常ベータ', enabled: true, rank: 'A', bonus: 62 }],
    challenge: [{ name: '架空のチャレンジガンマ', enabled: true, rank: 'B', bonus: 198 }, { name: '架空のチャレンジデルタ', enabled: true, rank: 'A', bonus: 146 }],
  };
}
