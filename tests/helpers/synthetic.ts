import { emptyCatalog } from '../../src/data/catalog/validate';
import { emptyCollection } from '../../src/storage/collection';
import type { Masterdata } from '../../src/data/catalog/model';
import type { Collection } from '../../src/storage/collection';
const stats = (performance:number,technic:number,visual:number) => ({performance,technic,visual});
/** Entirely invented. No source rows, game identities, observations or user holdings. */
export function syntheticCatalog(): Masterdata {
  return {...emptyCatalog(),catalogId:'fictional-kappa',revision:'test-1',
    bands:[{id:8101,name:'架空バンド・カッパ'}],
    characters:[{id:8201,bandId:8101,name:'架空奏者A'}],
    members:[{id:8301,characterId:8201,cardType:7,rarity:4,name:'架空メンバーA',title:'テスト専用の紙飛行機',maxStats:stats(101,203,307),levelGroup:8401,trainingGroup:8402,awakeningGroup:8403,liveSkillLevels:[1,2],gekisouSkillLevels:[1,2]}],
    snaps:[{id:8501,characterIds:[8201],cardType:7,rarity:3,name:'架空Snap',title:'試験用の凧',maxPercentBp:stats(321,654,987),levelGroup:8502,rankGroup:8503}],
    characterRankLevels:[1,2,3,7],
    memberLevels:[{group:8401,level:1,rates:stats(5000,6000,7000)},{group:8401,level:2,rates:stats(10000,10000,10000)}],
    memberTraining:[{group:8402,stage:1,rates:stats(1000,2000,3000)},{group:8402,stage:2,rates:stats(2000,3000,4000)}],
    memberAwakening:[{group:8403,stage:1,rates:stats(500,500,500)},{group:8403,stage:2,rates:stats(1500,1500,1500),leaderSkillLevel:2}].map(r=>({...r,leaderSkillLevel:'leaderSkillLevel' in r ? r.leaderSkillLevel! : 1})),
    memberLevelLimits:[{rarity:4,trainingStage:1,limitLevel:1},{rarity:4,trainingStage:2,limitLevel:2}],
    snapLevels:[{group:8502,level:1,rates:stats(5000,5000,5000)},{group:8502,level:2,rates:stats(10000,10000,10000)}],
    snapRanks:[{group:8503,rank:1,limitLevel:1,supportSkillLevels:[1,1]},{group:8503,rank:2,limitLevel:2,supportSkillLevels:[2,2]}],
    bandItems:[{id:8601,bandId:8101,name:'架空譜面台'}],
    bandItemLevels:[{itemId:8601,level:1},{itemId:8601,level:2}],
    bandItemEffects:[{itemId:8601,level:1,effectType:1000,valueBp:130,targetIds:[8701]},{itemId:8601,level:2,effectType:1000,valueBp:170,targetIds:[8701]}],
    skillTargets:[{id:8701,targetType:3,bandId:8101,characterId:0,cardType:0,tagId:0}]
  };
}
export function syntheticCollection(m = syntheticCatalog()): Collection {
  return {...emptyCollection(m),
    members:[{cardId:8301,level:1,trainingStage:1,awakeningStage:1,liveSkillLevel:1,gekisouSkillLevel:1}],
    snaps:[{supportCardId:8501,level:1,rank:1}],characterRanks:{8201:3},bandItems:{8601:1}};
}
