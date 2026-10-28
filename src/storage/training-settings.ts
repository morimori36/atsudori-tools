import { DEFAULT_TRAINING, validateTrainingSettings } from '../app/hypothetical-training';
import type { TrainingSettings } from '../app/hypothetical-training';
import { loadJson, saveJson } from './local';
import type { StoragePort } from './local';
export const TRAINING_STORAGE_KEY='atsudori-tools.hypothetical-training.v1';
export function createTrainingSettings(storage:StoragePort|undefined) {
  const loaded=loadJson(storage,TRAINING_STORAGE_KEY,raw=>validateTrainingSettings(JSON.parse(raw)));
  let value=loaded.status==='loaded'?loaded.value:{...DEFAULT_TRAINING};
  let damaged=loaded.status==='invalid';
  let message=damaged?'保存した仮育成設定を読み込めません。元の設定を保護し、初期設定を一時使用しています。':loaded.status==='unavailable'?loaded.error:'';
  const listeners=new Set<()=>void>();
  return {
    current:()=>({...value}), message:()=>message, damaged:()=>damaged,
    subscribe(listener:()=>void) {listeners.add(listener);return ()=>listeners.delete(listener);},
    update(next:TrainingSettings, recover=false) {
      if(damaged&&!recover) return;
      value=validateTrainingSettings(next);damaged=false;
      const result=saveJson(storage,TRAINING_STORAGE_KEY,()=>JSON.stringify(value));
      message=result.status==='failed'?'仮育成設定はブラウザに未保存です。'+result.error:'';
      listeners.forEach(l=>l());
    },
  };
}
export type TrainingSettingsStore=ReturnType<typeof createTrainingSettings>;
