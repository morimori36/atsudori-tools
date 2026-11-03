import { syntheticCatalog, syntheticCollection } from './synthetic';
/** Independent paper-counter fixture: shared, single, and untargeted tokens. */
export function automaticFixture() {
  const master=syntheticCatalog();
  master.characters.push({id:8202,bandId:8101,name:'架空奏者B'});
  master.songClearCounts={8201:8,8202:3};
  master.stamps=[{id:9101,name:'架空の折り紙',characterIds:[8201]},
    {id:9102,name:'架空の紙風船',characterIds:[8201,8202]},
    {id:9103,name:'架空の白紙',characterIds:[]}];
  const collection=syntheticCollection(master);collection.characterRanks={};
  return {master,collection};
}
