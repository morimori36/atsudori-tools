import type { Masterdata } from '../../src/data/catalog/model';
import type { RankRules } from '../../src/domain/character-rank/rules';
import { digest } from '../../src/domain/conversion/profile';
import { syntheticCatalog } from './synthetic';
/** Invented rules, deliberately unrelated to any game's progression or rewards. */
export async function fictionalRules(master:Masterdata=syntheticCatalog()):Promise<RankRules> {
  return {format:'atsudori-tools/character-rank-rules',schemaVersion:1,engine:'achievement-thresholds/1',id:'fictional-origami',version:'test-9',
    catalog:{catalogId:master.catalogId,revision:master.revision,sha256:await digest(master)},
    provenance:{sources:[{id:'invented-test-rules',revision:'test-9',sha256:'9'.repeat(64)}]},
    manualProgress:[{key:'stamps',label:'架空進捗A'},{key:'songClears',label:'架空進捗B'},{key:'bondRankTotal',label:'架空進捗C'},{key:'liveClears',label:'架空進捗D'}],
    achievements:[
      {id:'paper',kind:'members',label:'架空所持A',stage:null,thresholds:[1,4,11],exp:3},
      {id:'kite',kind:'snaps',label:'架空所持B',stage:null,thresholds:[2,6],exp:5},
      {id:'ink',kind:'stamps',label:'架空進捗A',stage:null,thresholds:[2,9,17],exp:7},
      {id:'glue',kind:'songClears',label:'架空進捗B',stage:null,thresholds:[3,8,21],exp:11},
      {id:'fold',kind:'bondRankTotal',label:'架空進捗C',stage:null,thresholds:[6,23],exp:13},
      {id:'wind',kind:'liveClears',label:'架空進捗D',stage:null,thresholds:[7,31,88],exp:17},
      {id:'train',kind:'training',label:'架空段階A',stage:2,thresholds:[1,3,8],exp:19},
      {id:'awake',kind:'awakening',label:'架空段階B',stage:2,thresholds:[1,5],exp:23},
      {id:'limit',kind:'snapRank',label:'架空段階C',stage:2,thresholds:[1,4],exp:29},
      {id:'skills',kind:'skills',label:'架空スキル集計',stage:2,thresholds:[1,2,5],exp:31}],
    rankThresholds:[{rank:1,exp:0},{rank:2,exp:7},{rank:3,exp:19},{rank:7,exp:41}]};
}
