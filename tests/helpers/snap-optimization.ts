import {syntheticCatalog,syntheticCollection} from './synthetic';

export function snapOptimizationFixture() {
  const master=syntheticCatalog(),collection=syntheticCollection(master);
  master.characters.push({...master.characters[0]!,id:8202,name:'架空奏者B'});
  master.members.push({...master.members[0]!,id:8302,characterId:8202});
  collection.members.push({...collection.members[0]!,cardId:8302});
  collection.characterRanks['8202']=3;
  master.snaps[0]!.characterIds=[8201,8202];
  master.snaps[0]!.title='架空共有Snap';
  master.snaps.push({...master.snaps[0]!,id:8504,title:'架空専用Snap',characterIds:[8201],maxPercentBp:{performance:100,technic:100,visual:100}});
  collection.snaps.push({...collection.snaps[0]!,supportCardId:8504});
  return {master,collection};
}
