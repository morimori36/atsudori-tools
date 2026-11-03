import { syntheticCatalog, syntheticCollection } from './synthetic';
import type { TrainingSettings } from '../../src/app/hypothetical-training';

/** Independent counter example: rewards at two/four trained paper cards are non-additive. */
export const expTraining:TrainingSettings={trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2,snapRank:2};
export function characterExpFixture() {
  const m=syntheticCatalog(),c=syntheticCollection(m);
  m.characters.push({id:8202,bandId:8101,name:'架空奏者B'});
  m.members.push(...[8302,8303,8304].map(id=>({...m.members[0]!,id,name:`架空の紙メンバー${id}`})));
  m.snaps[0]!.characterIds=[8201,8202];
  m.snaps.push(...[8504,8505,8506].map(id=>({...m.snaps[0]!,id,name:`架空の紙スナップ${id}`})));
  c.members.push({...c.members[0]!,cardId:8302});c.snaps.push({...c.snaps[0]!,supportCardId:8504});
  c.characterRanks={8201:32};c.characterProgress={8201:{liveClears:4,bondRankTotal:999,skillLevel5:777},8202:{bondRankTotal:999}};
  m.characterRankLevels=[1,28,30,32];m.songClearCounts={8201:2};
  m.stamps=[{id:9101,name:'架空の紙切れ',characterIds:[8201]}];c.ownedStampIds=[9101];
  m.rankDefinition={engine:'achievement-thresholds/1',id:'invented-exp-counters',version:'toy-1',
    provenance:{sources:[{id:'independent-counter-arithmetic',revision:'toy-1',sha256:'c'.repeat(64)}]},
    manualProgress:[{key:'bondRankTotal',label:'架空絆'},{key:'liveClears',label:'架空ライブ'},{key:'stamps',label:'架空紙片'},{key:'songClears',label:'架空曲'}],
    achievements:[
      {id:'member',kind:'members',stage:null,label:'架空メンバー',thresholds:[1,4],exp:5},
      {id:'snap',kind:'snaps',stage:null,label:'架空スナップ',thresholds:[1,4],exp:7},
      {id:'training',kind:'training',stage:2,label:'架空特訓',thresholds:[2,4],exp:11},
      {id:'awakening',kind:'awakening',stage:2,label:'架空覚醒',thresholds:[2,4],exp:13},
      {id:'skills',kind:'skills',stage:2,label:'架空スキル',thresholds:[5,10],exp:3},
      {id:'rank',kind:'snapRank',stage:2,label:'架空上限解放',thresholds:[2,4],exp:17},
      {id:'bond',kind:'bondRankTotal',stage:null,label:'架空絆',thresholds:[28,32],exp:2},
      {id:'live',kind:'liveClears',stage:null,label:'架空ライブ',thresholds:[4],exp:2},
      {id:'stamps',kind:'stamps',stage:null,label:'架空紙片',thresholds:[1],exp:3},
      {id:'songs',kind:'songClears',stage:null,label:'架空曲',thresholds:[2],exp:4},
    ],rankThresholds:[{rank:1,exp:0},{rank:28,exp:10},{rank:30,exp:30},{rank:32,exp:80}]};
  return {m,c};
}
