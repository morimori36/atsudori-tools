import { materialFixture } from './materials';

/** Independent paper arithmetic, using public toy fixtures only. */
export function maximumTrainingFixture() {
  const {m,c}=materialFixture();
  m.characters.push({id:8202,bandId:8101,name:'架空の紙笛奏者'});
  m.characterRankLevels=[1,2,3,4];
  m.rankDefinition={engine:'achievement-thresholds/1',id:'invented-growth',version:'toy-1',
    provenance:{sources:[{id:'independent-paper-growth',revision:'toy-1',sha256:'b'.repeat(64)}]},
    manualProgress:[{key:'bondRankTotal',label:'架空の紙絆'}],
    achievements:[
      {id:'training-paper',kind:'training',label:'架空の特訓',stage:2,thresholds:[1],exp:3},
      {id:'skill-paper',kind:'skills',label:'架空のスキル',stage:2,thresholds:[1,2],exp:3},
      {id:'bond-paper',kind:'bondRankTotal',label:'架空の絆',stage:null,thresholds:[2],exp:3},
    ],
    rankThresholds:[{rank:1,exp:0},{rank:2,exp:3},{rank:3,exp:6},{rank:4,exp:9}],
    totalRankBonuses:[{rank:0,bonus:0},{rank:5,bonus:10}]};
  // Current rank 1 permits Lv2. Higher rank permits Lv3 but must not be purchased.
  m.snapRanks[0]!.limitLevel=2;
  m.snapRanks[1]!.limitLevel=3;
  m.snapLevels.push({...m.snapLevels[1]!,level:3});
  const snapLv=m.materialDefinition!.schedules.find(s=>s.id==='snap-lv')!;
  snapLv.stages.push({stage:3,amounts:[{resourceId:'snap-exp',quantity:200}]});
  m.snaps[0]!.characterIds=[8201,8202];
  m.snaps.push({...m.snaps[0]!,id:8504,name:'架空の成長する紙風船',levelGroup:8512,characterIds:[8201,8202],
    maxPercentBp:{performance:1000,technic:1000,visual:1000}});
  m.snapLevels.push(...[1,2,3].map(level=>({group:8512,level,rates:{performance:level===1?1000:10000,technic:level===1?1000:10000,visual:level===1?1000:10000}})));
  m.materialDefinition!.bindings.push({kind:'snap',cardId:8504,axis:'level',scheduleId:'snap-lv'}, {kind:'snap',cardId:8504,axis:'rank',scheduleId:'rank'});
  c.snaps.push({supportCardId:8504,rank:1,level:1});
  c.characterRanks={};delete c.totalRankBonus;
  c.characterProgress={8201:{bondRankTotal:0},8202:{bondRankTotal:0}};
  c.bandItems={8601:null};
  return {m,c};
}
