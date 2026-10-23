import {it,expect} from 'vitest';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {deriveMemberDisplay,deriveBandItemRate} from '../../src/data/catalog/growth';
import {summarizeBands} from '../../src/app/evaluate-collection';
import {validateCollection} from '../../src/storage/collection';
it('preserves an invented binary32 boundary independently checked with IEEE 754 packing',()=>{
  const m=syntheticCatalog();
  m.members[0]!.maxStats={performance:100003,technic:203,visual:307};
  m.memberLevels[0]!.rates={performance:9999,technic:6000,visual:7000};
  m.memberTraining[0]!.rates={performance:0,technic:0,visual:0};
  m.memberAwakening[0]!.rates={performance:0,technic:0,visual:0};
  // 999929997 -> f32 999929984; /10000 -> f32 99993; exact rational floor would be 99992.
  expect(deriveMemberDisplay(m,syntheticCollection(m).members[0]!).displayedStats.performance).toBe(99993);
  expect(Math.floor(100003*9999/10000)).toBe(99992);
});
it('rejects unsafe aggregate totals rather than displaying rounded numbers',()=>{
  const colors=[1,2].map(cardType=>({bandId:8101,cardType,slots:[],subtotal:Number.MAX_SAFE_INTEGER,rating:Number.MAX_SAFE_INTEGER,provisional:false}));
  expect(()=>summarizeBands(colors)).toThrow('safe integer');
});
it('rejects unsafe sums of item effects',()=>{
  const m=syntheticCatalog();
  m.bandItems.push({id:8602,bandId:8101,name:'架空の追加譜面台'});
  m.bandItemLevels.push({itemId:8602,level:1});
  m.bandItemEffects[0]!.valueBp=9007199254740990;
  m.bandItemEffects.push({itemId:8602,level:1,valueBp:9007199254740990,effectType:1000,targetIds:[8701]});
  expect(()=>deriveBandItemRate(m,8101,{8601:1,8602:1})).toThrow('safe integer');
});
it('requires a valid namespace even for an empty collection',()=>{
  const m=syntheticCatalog(),c={...syntheticCollection(m),members:[],snaps:[],characterRanks:{},bandItems:{}};
  expect(()=>validateCollection({...c,catalogId:undefined},m)).toThrow('catalogId');
});
