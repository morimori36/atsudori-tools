import { expect, it } from 'vitest';
import { evaluateCollection, summarizeCharacters, summarizeBands } from '../../src/app/evaluate-collection';
import { multiMemberFixture } from '../helpers/multi-member';

it.each([[1,857],[2,1624],[3,2391]])('groups %i selected cards without changing their ratings', (count, expected) => {
  const {master,collection} = multiMemberFixture();
  collection.members = collection.members.slice(0,count);
  const colors = evaluateCollection(master,collection);
  const before = JSON.stringify(colors);
  const groups = summarizeCharacters(colors[0]!);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.slots).toHaveLength(count);
  expect(groups[0]!.rating).toBe(expected);
  expect(groups.reduce((sum,g)=>sum+g.rating!,0)).toBe(colors[0]!.rating);
  expect(summarizeBands(colors)[0]!.rating).toBe(expected);
  expect(JSON.stringify(colors)).toBe(before);
});

it('groups non-adjacent rows by character, preserving all card and Snap details', () => {
  const {master,collection} = multiMemberFixture();
  const color = evaluateCollection(master,collection)[0]!;
  const other = {...color.slots[1]!, selection:{...color.slots[1]!.selection,characterId:999}};
  const groups = summarizeCharacters({...color,slots:[color.slots[0]!,other,color.slots[2]!]});
  expect(groups.map(g=>g.characterId)).toEqual([color.slots[0]!.selection.characterId,999]);
  expect(groups.map(g=>g.rating)).toEqual([1624,767]);
  expect(groups[0]!.slots).toEqual([color.slots[0],color.slots[2]]);
});

it.each(['ambiguous','resolved'] as const)('keeps a partial character total pending for %s selection', status => {
  const {master,collection} = multiMemberFixture();
  const color = evaluateCollection(master,collection)[0]!;
  color.slots[1] = {selection:{...color.slots[1]!.selection,status},status:'pending',reasons:['架空の保留理由']};
  const group = summarizeCharacters(color)[0]!;
  expect(group.subtotal).toBe(1624);
  expect(group.rating).toBeNull();
  expect(group.slots).toHaveLength(3);
});
