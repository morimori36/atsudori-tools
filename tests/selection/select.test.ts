import {it,expect} from 'vitest';
import {selectByColor} from '../../src/domain/selection/select';
const m=(id:number,characterId:number,rarity=4,bandId=81,cardType=7)=>({id,characterId,rarity,bandId,cardType});
const s=(id:number,characterIds:number[],rarity=3,cardType=7,scoreBp=1000)=>({id,characterIds,rarity,cardType,scoreBp});
it('selects member rarity before progression or import order',()=>{
  const out=selectByColor([m(101,201,2),m(102,201,4)],[]);
  expect(out[0]?.slots[0]?.member).toMatchObject({status:'selected',candidate:{id:102},provisional:false});
});
it('isolates band, color and character, reusing Snap across bands',()=>{
  const out=selectByColor([m(101,201),m(102,202,4,82),m(103,201,4,81,8)],[s(301,[201,202])]);
  expect(out).toHaveLength(3);
  expect(out.filter(c=>c.cardType===7).map(c=>c.slots[0]?.snap)).toEqual([
    expect.objectContaining({status:'selected',candidate:expect.objectContaining({id:301})}),
    expect.objectContaining({status:'selected',candidate:expect.objectContaining({id:301})})]);
  expect(out.find(c=>c.cardType===8)?.slots[0]?.snap.status).toBe('none');
});
it('assigns a shared Snap to the higher rarity member',()=>{
  const out=selectByColor([m(101,201,2),m(102,202,4)],[s(301,[201,202])]);
  expect(out[0]?.slots[0]?.snap.status).toBe('none');
  expect(out[0]?.slots[1]?.snap).toMatchObject({status:'selected',candidate:{id:301}});
});
it('uses stable identity ties and preserves provisional notices',()=>{
  const a=selectByColor([m(102,201),m(101,201)],[s(302,[201]),s(301,[201])]);
  const b=selectByColor([m(101,201),m(102,201)],[s(301,[201]),s(302,[201])]);
  expect(a).toEqual(b);expect(a[0]?.slots[0]?.member).toMatchObject({candidate:{id:101},provisional:true});
  expect(a[0]?.slots[0]?.snap).toMatchObject({candidate:{id:301},provisional:true});
  expect(a[0]?.slots[0]?.notices.join('')).toContain('未確認');
});
it('keeps unknown rarity collisions pending',()=>{
  const out=selectByColor([m(101,201,99),m(102,201,4)],[s(301,[201])]);
  expect(out[0]?.status).toBe('ambiguous');
});
it('treats EX/BD as comparison policy, preserving raw rarity',()=>{
  const ex=m(101,201,10);const out=selectByColor([ex,m(102,201,3)],[]);
  expect(out[0]?.slots[0]?.member).toMatchObject({candidate:{id:101,rarity:10}});
  expect(out[0]?.slots[0]?.notices.join('')).toContain('暫定');
  expect(ex.rarity).toBe(10);
  expect(selectByColor([m(101,201,20),m(102,201,2)],[])[0]?.slots[0]?.member).toMatchObject({candidate:{id:101}});
});
it('annotates greedy alternatives instead of optimizing the rating',()=>{
  const out=selectByColor([m(101,201),m(102,202,3)],[s(301,[201,202],4),s(302,[201],3)]);
  expect(out[0]?.slots[0]?.snap).toMatchObject({candidate:{id:301}});
  expect(out[0]?.slots[1]?.snap.status).toBe('none');
  expect(out[0]?.slots[0]?.notices.join('')).toContain('複数候補');
});
it('rejects duplicate ownership identities',()=>{
  expect(()=>selectByColor([m(101,201),m(101,201)],[])).toThrow('duplicate');
});

const memberIds = (members: ReturnType<typeof m>[]) => selectByColor(members, [])[0]!.slots.map(slot => slot.member.status === 'selected' ? slot.member.candidate.id : null);
it.each([
  [[m(101,201,2),m(102,201,3)], [102,101]],
  [[m(102,201,3),m(101,201,3)], [101,102]],
  [[m(103,201,2),m(102,201,3),m(101,201,4)], [101,102,103]],
  [[m(101,201,2),m(102,201,3),m(103,201,4),m(104,201,3),m(105,201,2)], [103,102,104]],
  [[m(105,201),m(104,201),m(103,201),m(102,201),m(101,201)], [101,102,103]],
])('selects up to three independent members in rarity and ID order', (members, expected) => {
  const before = JSON.stringify(members);
  expect(memberIds(members)).toEqual(expected);
  expect(memberIds([...members].reverse())).toEqual(expected);
  expect(JSON.stringify(members)).toBe(before);
});
it.each([0,1,2,3,4])('assigns %i candidate Snaps once, highest member first, with a three-card cap', count => {
  const members = [m(101,201,2),m(102,201,3),m(103,201,4),m(104,201,2)];
  const snaps = Array.from({length:count}, (_,i) => s(301+i,[201]));
  const output = selectByColor(members,snaps), slots = output[0]!.slots;
  expect(slots.map(slot => slot.member.status === 'selected' && slot.member.candidate.id)).toEqual([103,102,101]);
  expect(slots.map(slot => slot.snap.status === 'selected' ? slot.snap.candidate.id : null)).toEqual([0,1,2].map(i => i<count ? 301+i : null));
  expect(output[0]!.status).toBe('resolved');
  expect(selectByColor([...members].reverse(),[...snaps].reverse())).toEqual(output);
});
it('never double uses shared Snaps across multiple cards and characters, in score order', () => {
  const members = [m(104,201,2),m(103,202,3),m(102,201,4),m(101,201,3)];
  const snaps = [s(301,[201,202],4,7,100),s(302,[201,202],2,7,300),s(303,[201,202],3,7,200)];
  const output = selectByColor(members,snaps), slots = output[0]!.slots;
  const assigned = Object.fromEntries(slots.map(slot => [slot.member.status === 'selected' && slot.member.candidate.id, slot.snap.status === 'selected' ? slot.snap.candidate.id : null]));
  expect(assigned).toEqual({102:302,101:303,103:301,104:null});
  expect(selectByColor([...members].reverse(),[...snaps].reverse())).toEqual(output);
});
it('keeps unknown shared recipient orders pending across repeated character rows', () => {
  const output = selectByColor([m(101,201,99),m(102,202,3),m(103,202,2)],[s(301,[201,202])]);
  expect(output[0]!.status).toBe('unresolved');
  expect(output[0]!.slots.every(slot => slot.snap.status !== 'selected')).toBe(true);
});
it('retains EX/BD comparison priority when selecting three of four cards', () => {
  expect(memberIds([m(101,201,2),m(102,201,20),m(103,201,10),m(104,201,4)])).toEqual([103,104,102]);
});
it('allows the same three shared Snaps again in another band, but never twice within either band', () => {
  const members = [m(101,201,4),m(102,201,3),m(103,201,2),m(104,202,4,82),m(105,202,3,82),m(106,202,2,82)];
  const colors = selectByColor(members,[s(301,[201,202]),s(302,[201,202]),s(303,[201,202])]);
  expect(colors.map(c=>c.slots.map(slot=>slot.snap.status==='selected' && slot.snap.candidate.id))).toEqual([[301,302,303],[301,302,303]]);
});

it('ignores all Snap rarity orders, including unknown codes, and breaks score ties by ID', () => {
  const snaps = [s(303,[201],4,7,900),s(302,[201],10,7,800),s(301,[201],99,7,900)];
  const result = selectByColor([m(101,201)],snaps);
  expect(result[0]!.slots[0]!.snap).toMatchObject({candidate:{id:301},provisional:true});
  expect(result[0]!.slots[0]!.notices.join('')).toContain('実効補正');
  expect(selectByColor([m(101,201)],[...snaps].reverse())).toEqual(result);
});
it.each([undefined,NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid or missing Snap score %s', scoreBp => {
  expect(()=>selectByColor([m(101,201)],[{...s(301,[201]),scoreBp:scoreBp as number}])).toThrow('Snap scoreBp');
});
