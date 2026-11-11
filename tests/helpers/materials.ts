import { syntheticCatalog, syntheticCollection } from './synthetic';
import type { MaterialSchedule } from '../../src/domain/materials/model';
export function materialFixture(){
  const m=syntheticCatalog();
  const schedule=(id:string,axis:MaterialSchedule['axis'],n:number):MaterialSchedule=>({id,axis,mode:'steps',basis:'独立に設計した架空費用表',stages:[{stage:1,amounts:[]},{stage:2,amounts:[{resourceId:'paper',quantity:n}]}]});
  m.materialDefinition={trackingVersion:1,excludedResourceIds:[],catalogRevision:m.revision,resources:[{id:'paper',name:'架空の折紙',unit:'item'},{id:'member-exp',name:'架空Member経験値',unit:'exp'},{id:'snap-exp',name:'架空Snap経験値',unit:'exp'},{id:'copy',name:'架空Snapの複製',unit:'card'}],
    schedules:[schedule('train','trainingStage',7),schedule('awake','awakeningStage',11),schedule('live','liveSkillLevel',13),
      {id:'geki',axis:'gekisouSkillLevel',mode:'unsupported',basis:'架空の調査記録',reason:'費用の根拠未確認',stages:[]},
      {...schedule('rank','rank',0),stages:[{stage:1,amounts:[]},{stage:2,amounts:[{resourceId:'copy',quantity:2}]}]},
      ...(['member','snap'] as const).map((kind,i):MaterialSchedule=>({id:kind+'-lv',axis:'level',mode:'cumulative',basis:'架空の累計EXP表',stages:[{stage:1,amounts:[{resourceId:kind+'-exp',quantity:17}]},{stage:2,amounts:[{resourceId:kind+'-exp',quantity:60+i*20}]}]}))],
    bindings:[...(['trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel','level'] as const).map((axis,i)=>({kind:'member' as const,cardId:8301,axis,scheduleId:['train','awake','live','geki','member-lv'][i]!})),{kind:'snap',cardId:8501,axis:'rank',scheduleId:'rank'},{kind:'snap',cardId:8501,axis:'level',scheduleId:'snap-lv'}]};
  return {m,c:syntheticCollection(m)};
}
