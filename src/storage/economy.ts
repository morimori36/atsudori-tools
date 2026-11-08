import { loadJson, saveJson } from './local';
import type { StoragePort } from './local';
import { exportEconomyScenario, importEconomyScenario, validateEconomyScenario } from '../domain/economy/validate';
import type { EconomyScenario } from '../domain/economy/model';

export const ECONOMY_STORAGE_KEY='atsudori-tools.economy-scenario.v5';
export function createEconomyStore(storage:StoragePort|undefined,initial:EconomyScenario) {
  const loaded=loadJson(storage,ECONOMY_STORAGE_KEY,importEconomyScenario);
  let legacy:string|null=null;try{legacy=storage?.getItem('atsudori-tools.economy-scenario.v4')??storage?.getItem('atsudori-tools.economy-scenario.v3')??storage?.getItem('atsudori-tools.economy-scenario.v2')??storage?.getItem('atsudori-tools.economy-scenario.v1')??null;}catch{/* storage error handled above */}
  let current=loaded.status==='loaded'?loaded.value:initial;
  let protectedData=loaded.status==='invalid'||loaded.status==='empty'&&legacy!==null;
  let unsaved=loaded.status==='unavailable';
  let message=protectedData?'保存した試算条件を読み込めません。元JSONを保護しています。':loaded.status==='unavailable'?loaded.error:'';
  return {
    current:()=>validateEconomyScenario(current),fresh:()=>loaded.status==='empty',protected:()=>protectedData,message:()=>message,unsaved:()=>unsaved,
    original:()=>loaded.status==='invalid'?loaded.raw:legacy,
    update(next:EconomyScenario,recover=false,atomic=false):boolean {
      if(protectedData&&!recover)throw new Error('元の試算条件を保護しています。条件JSONをImportするか、試算条件を初期化してください');
      const candidate=validateEconomyScenario(next);
      const saved=saveJson(storage,ECONOMY_STORAGE_KEY,()=>exportEconomyScenario(candidate));
      if(saved.status==='failed'){
        if(atomic)throw new Error('試算条件を保存できません。'+saved.error);
        current=candidate;unsaved=true;message='試算条件を保存できません。'+saved.error;return false;
      }
      current=candidate;protectedData=false;unsaved=false;message='';
      return true;
    }
  };
}
