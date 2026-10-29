import {expect,it} from 'vitest';
import {evaluateCollection} from '../../src/app/evaluate-collection';
import {potentialCollection} from '../../src/app/potential-collection';
import {calculateRating} from '../../src/domain/rating/calculate';
import {snapOptimizationFixture as fixture} from '../helpers/snap-optimization';

it.each([false,true])('combines dedicated and shared Snaps using actual calculated ratings (potential=%s)',potential=>{
  const {master,collection}=fixture(),before=JSON.stringify({master,collection});
  const owned=potential ? potentialCollection(master,collection) : collection;
  const color=evaluateCollection(master,owned,collection)[0]!;
  expect(color.slots.map(s=>s.selection.snap.status==='selected' && s.selection.snap.candidate.id)).toEqual([8504,8501]);
  // Current B=767, K=1.035 / 1.118 => 793+857=1650.
  // Potential B=1086 => 1124+1214=2338.
  expect(color.rating).toBe(potential ? 2338 : 1650);
  for(const slot of color.slots)expect(slot.result).toEqual(calculateRating(slot.input!));
  master.members.reverse();master.snaps.reverse();owned.members.reverse();owned.snaps.reverse();
  expect(evaluateCollection(master,owned,collection)).toEqual([color]);
  master.members.reverse();master.snaps.reverse();owned.members.reverse();owned.snaps.reverse();
  expect(JSON.stringify({master,collection})).toBe(before);
});
it.each(['rank','item','bonus','calculation'] as const)('does not invent a zero rating when %s is unavailable',kind=>{
  const {master,collection}=fixture();
  if(kind==='rank')delete collection.characterRanks['8202'];
  if(kind==='item')collection.bandItems={};
  if(kind==='bonus')delete collection.totalRankBonus;
  if(kind==='calculation')collection.members[1]!.liveSkillLevel=0;
  const color=evaluateCollection(master,collection)[0]!;
  expect(color.rating).toBeNull();
  expect(color.slots.every(s=>s.status==='pending' && !s.result && s.selection.snap.status==='none')).toBe(true);
  expect(color.slots.flatMap(s=>s.reasons).join('')).toContain('保留');
});
