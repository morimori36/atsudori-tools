import type { StoragePort } from './local';
import type { StarBudgetInput } from '../domain/star-budget/model';
import { emptyStarBudget, exportStarBudget, importStarBudget, validateStarBudget } from '../domain/star-budget/validate';

export const STAR_BUDGET_STORAGE_KEY = 'atsudori-tools.star-budget.v1';
export function createStarBudgetStore(storage: StoragePort | undefined) {
  let current = emptyStarBudget(), original: string | undefined, protectedData = false, unsaved = false, message = '';
  try {
    if (!storage) throw new Error();
    const raw = storage.getItem(STAR_BUDGET_STORAGE_KEY);
    if (raw !== null) {
      try { current = importStarBudget(raw); }
      catch { original = raw; protectedData = true; message = '保存したスター予算は破損または未対応の形式です。元JSONを保護しています。'; }
    }
  } catch { protectedData = true; unsaved = true; message = 'ブラウザ保存を読み取れません。既存データの保護のため自動保存を停止しています。'; }
  return {
    current: () => structuredClone(current),
    original: () => original,
    protected: () => protectedData,
    unsaved: () => unsaved,
    message: () => message,
    update(next: StarBudgetInput, options: { recover?: boolean; atomic?: boolean } = {}): boolean {
      if (protectedData && !options.recover) throw new Error('元JSONを保護しています。Importまたは初期化で明示的に復旧してください。');
      const candidate = validateStarBudget(next);
      try {
        if (!storage) throw new Error();
        storage.setItem(STAR_BUDGET_STORAGE_KEY, exportStarBudget(candidate));
      } catch {
        if (options.atomic) throw new Error('スター予算を保存できません。現在のデータは変更していません。');
        current = candidate; unsaved = true; message = 'スター予算を保存できません。未保存の条件・定義をJSONでExportしてください。'; return false;
      }
      current = candidate; protectedData = false; unsaved = false; original = undefined; message = '';
      return true;
    },
  };
}
