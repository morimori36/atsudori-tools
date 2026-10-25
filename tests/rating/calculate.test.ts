import { describe,it,expect } from 'vitest';
import { calculateRating } from '../../src/domain/rating/calculate';
import type { RatingInput } from '../../src/domain/rating/calculate';
const input = (): RatingInput => ({memberDisplayedStats:{performance:24,technic:24,visual:24},awakeLevel:1,liveSkillLevel:1,gekisouSkillLevel:1,characterRank:1,totalRankBonus:50,snapLimitBreak:0,snapPercentBp:{performance:0,technic:0,visual:0},bandItemTenthPercent:0});
describe('independent synthetic arithmetic',()=>{
  it('requires the total-rank bonus and applies it before item multiplication and floors',()=>{
    // 24*1.04+13=37.96; *1.013=38.45348 ->38 per channel ->114.
    expect(calculateRating({...input(),totalRankBonus:13,bandItemTenthPercent:13}).bandRating).toBe(114);
    expect(calculateRating({...input(),totalRankBonus:0}).bandRating).toBe(72);
    const {totalRankBonus,...missing}=input();
    expect(()=>calculateRating(missing as RatingInput)).toThrow();
    for(const n of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>calculateRating({...input(),totalRankBonus:n})).toThrow();
  });
  it('floors each 24*1.04+50 = 74.96 before summing',()=>{
    expect(calculateRating(input())).toEqual({postMemberStats:{performance:74,technic:74,visual:74},memberBase:222,snapMultiplierBp:10000,bandRating:222});
  });
  it('floors the final product: 222*1.0001 = 222.0222',()=>{
    expect(calculateRating({...input(),snapPercentBp:{performance:1,technic:0,visual:0}}).bandRating).toBe(222);
  });
  it('uses decimal integer units without binary64 intermediate rounding',()=>{
    const r=calculateRating({memberDisplayedStats:{performance:101,technic:202,visual:303},awakeLevel:2,liveSkillLevel:3,gekisouSkillLevel:1,characterRank:7,totalRankBonus:50,bandItemTenthPercent:13,snapPercentBp:{performance:321,technic:456,visual:789},snapLimitBreak:2});
    // floor(189.08*1.013)=191; floor(298.16*1.013)=302; floor(407.24*1.013)=412.
    // 905 * (1 + .0321 + .0456 + .0789 + .04) = 1082.923.
    expect(r).toEqual({postMemberStats:{performance:191,technic:302,visual:412},memberBase:905,snapMultiplierBp:11966,bandRating:1082});
  });
  it('keeps the rank term when displayed parameters are explicitly zero',()=>{
    expect(calculateRating({...input(),memberDisplayedStats:{performance:0,technic:0,visual:0}}).bandRating).toBe(150);
  });
  it.each([-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid stats %s',n=>{
    expect(()=>calculateRating({...input(),memberDisplayedStats:{performance:n,technic:0,visual:0}})).toThrow();
  });
  it.each(['awakeLevel','liveSkillLevel','gekisouSkillLevel','characterRank'] as const)('rejects zero %s',key=>{
    expect(()=>calculateRating({...input(),[key]:0})).toThrow();
  });
  it('rejects a final result beyond the safe integer range',()=>{
    expect(()=>calculateRating({...input(),memberDisplayedStats:{performance:Number.MAX_SAFE_INTEGER,technic:1,visual:1}})).toThrow();
  });
});
