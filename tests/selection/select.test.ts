import {it,expect} from 'vitest';
import {selectByColor as select} from '../../src/domain/selection/select';
import {calculateRating} from '../../src/domain/rating/calculate';
import type {MemberCandidate, SnapCandidate, CandidateRating} from '../../src/domain/selection/select';
const rating: CandidateRating = (member, snap) => calculateRating({
  memberDisplayedStats:{performance:member.id === 102 ? 2000 : 1000,technic:0,visual:0},
  awakeLevel:1,liveSkillLevel:1,gekisouSkillLevel:1,characterRank:1,totalRankBonus:0,bandItemTenthPercent:0,
  snapPercentBp:{performance:snap?.scoreBp ?? 0,technic:0,visual:0},snapLimitBreak:0,
}).bandRating;
const selectByColor = (members: MemberCandidate[], snaps: SnapCandidate[]) => select(members,snaps,rating);
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
it('assigns a shared Snap by calculated benefit',()=>{
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
it('combines dedicated and shared Snaps to maximize the rating',()=>{
  const out=selectByColor([m(101,201),m(102,202,3)],[s(301,[201,202],4),s(302,[201],3)]);
  expect(out[0]?.slots[0]?.snap).toMatchObject({candidate:{id:302}});
  expect(out[0]?.slots[1]?.snap).toMatchObject({candidate:{id:301}});
  expect(out[0]?.slots[0]?.notices.join('')).toContain('合計最大化');
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
it.each([0,1,2,3,4])('assigns %i candidate Snaps once, by rating with stable ID ties, with a three-card cap', count => {
  const members = [m(101,201,2),m(102,201,3),m(103,201,4),m(104,201,2)];
  const snaps = Array.from({length:count}, (_,i) => s(301+i,[201]));
  const output = selectByColor(members,snaps), slots = output[0]!.slots;
  expect(slots.map(slot => slot.member.status === 'selected' && slot.member.candidate.id)).toEqual([103,102,101]);
  expect(slots.map(slot => slot.snap.status === 'selected' ? slot.snap.candidate.id : null)).toEqual(count===0 ? [null,null,null] : count===1 ? [null,301,null] : count===2 ? [null,302,301] : [303,302,301]);
  expect(output[0]!.status).toBe('resolved');
  expect(selectByColor([...members].reverse(),[...snaps].reverse())).toEqual(output);
});
it('never double uses shared Snaps across multiple cards and characters, in score order', () => {
  const members = [m(104,201,2),m(103,202,3),m(102,201,4),m(101,201,3)];
  const snaps = [s(301,[201,202],4,7,100),s(302,[201,202],2,7,300),s(303,[201,202],3,7,200)];
  const output = selectByColor(members,snaps), slots = output[0]!.slots;
  const assigned = Object.fromEntries(slots.map(slot => [slot.member.status === 'selected' && slot.member.candidate.id, slot.snap.status === 'selected' ? slot.snap.candidate.id : null]));
  expect(assigned).toEqual({102:302,101:301,103:303,104:null});
  expect(selectByColor([...members].reverse(),[...snaps].reverse())).toEqual(output);
});
it('does not use rarity to decide shared Snap recipients when members are selected', () => {
  const output = selectByColor([m(101,201,99),m(102,202,3),m(103,202,2)],[s(301,[201,202])]);
  expect(output[0]!.status).toBe('resolved');
  expect(output[0]!.slots.filter(slot => slot.snap.status === 'selected')).toHaveLength(1);
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
  expect(result[0]!.slots[0]!.notices.join('')).toContain('合計最大化');
  expect(selectByColor([m(101,201)],[...snaps].reverse())).toEqual(result);
});
it.each([undefined,NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid or missing Snap score %s', scoreBp => {
  expect(()=>selectByColor([m(101,201)],[{...s(301,[201]),scoreBp:scoreBp as number}])).toThrow('Snap scoreBp');
});

it('can give a shared Snap to a lower rarity member with greater rating benefit', () => {
  const result = selectByColor([m(101,201,4),m(102,202,2)],[s(301,[201,202])]);
  expect(result[0]!.slots.map(slot => slot.snap.status)).toEqual(['none','selected']);
});
it('C differs from B (maximum equipped count) and D (dedicated first)', () => {
  // A base=1040, B base=2080. Shared +100%, dedicated B +1%.
  // C: shared B, A none = 1040+4160=5200 (one equipped).
  // B or D: shared A, dedicated B = 2080+2100=4180 (two equipped).
  const members = [m(101,201),m(102,202)], snaps = [s(301,[201,202],3,7,10000),s(302,[202],3,7,100)];
  const result = selectByColor(members,snaps)[0]!;
  expect(result.slots.map(slot => slot.snap.status==='selected' ? slot.snap.candidate.id : null)).toEqual([null,301]);
  const c = rating(members[0]!,undefined)! + rating(members[1]!,snaps[0])!;
  const bAndD = rating(members[0]!,snaps[0])! + rating(members[1]!,snaps[1])!;
  expect(c).toBe(5200); expect(bAndD).toBe(4180);
});
it('keeps the whole allocation pending if even a losing candidate cannot be calculated', () => {
  const result=select([m(101,201),m(102,202)],[s(301,[201,202]),s(302,[201])],
    (member,snap)=>snap?.id===302 ? null : rating(member,snap));
  expect(result[0]!.status).toBe('unresolved');
  expect(result[0]!.slots.every(slot=>slot.snap.status==='none' && slot.allocationReason)).toBe(true);
});
it('ties use actual rounded rating, not effective Snap score', () => {
  const result=select([m(101,201)],[s(302,[201],3,7,2),s(301,[201],3,7,1)],
    (_,snap)=>calculateRating({memberDisplayedStats:{performance:1,technic:0,visual:0},awakeLevel:1,
      liveSkillLevel:1,gekisouSkillLevel:1,characterRank:1,totalRankBonus:0,bandItemTenthPercent:0,
      snapPercentBp:{performance:snap?.scoreBp??0,technic:0,visual:0},snapLimitBreak:0}).bandRating);
  expect(result[0]!.slots[0]!.snap).toMatchObject({candidate:{id:301}});
});
