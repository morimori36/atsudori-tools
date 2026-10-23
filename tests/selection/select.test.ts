import {it,expect} from 'vitest';
import {selectByColor} from '../../src/domain/selection/select';
const m=(id:number,characterId:number,rarity=4,bandId=81,cardType=7)=>({id,characterId,rarity,bandId,cardType});
const s=(id:number,characterIds:number[],rarity=3,cardType=7)=>({id,characterIds,rarity,cardType});
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
