import { expect,test } from 'vitest';
import { materialConsumers } from '../../src/ui/materials';
import { simulateTrainingEvaluation } from '../../src/app/training-simulation';
import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';
import { maximumTrainingFixture } from '../helpers/maximum-training';

test('reverse index preserves totals, separate axes and shared Snap identity',()=>{
  const {m,c}=maximumTrainingFixture();
  const result=simulateTrainingEvaluation(m,c,{...DEFAULT_TRAINING,awakeningStage:2});
  const indexed=materialConsumers(result.materials);
  for(const total of result.materials.totals)expect(indexed.get(total.resourceId)!.reduce((n,r)=>n+r.quantity,0)).toBe(total.quantity);
  expect(indexed.get('paper')!.map(r=>[r.axis.axis,r.quantity])).toEqual([['trainingStage',7],['awakeningStage',11],['liveSkillLevel',13]]);
  expect(indexed.get('snap-exp')!.map(r=>[r.card.cardId,r.quantity])).toEqual([[8501,63],[8504,63]]);
  expect([...indexed.values()].flat().some(r=>r.axis.status==='unavailable')).toBe(false);
  expect(indexed.get('member-exp')![0]!.axis.status).toBe('bounded');
});
