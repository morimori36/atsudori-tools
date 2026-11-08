import { describe,it,expect } from 'vitest';
import { materialShortageText } from '../src/ui/materials';
import { DEFAULT_TRAINING } from '../src/app/hypothetical-training';
import { maximumTrainingFixture } from './helpers/maximum-training';

describe('material report boundaries',()=>{
  it('distinguishes missing definitions from zero requirements without changing inputs',()=>{
    const {m,c}=maximumTrainingFixture();
    delete m.materialDefinition;
    const before=JSON.stringify({m,c,settings:DEFAULT_TRAINING});
    const text=materialShortageText(m,c,DEFAULT_TRAINING);
    expect(text).toContain('素材マスタ未登録・必要量未計算');
    expect(text).toContain('メンバー：必要量未計算');
    expect(text).toContain('スナップ：必要量未計算');
    expect(text).not.toContain('追加の要求量なし');
    expect(JSON.stringify({m,c,settings:DEFAULT_TRAINING})).toBe(before);
  });
  it('keeps catalog text within TSV cells and includes only positive requirements',()=>{
    const {m,c}=maximumTrainingFixture();
    m.materialDefinition!.resources.find(r=>r.id==='paper')!.name='架空\t素材\n名称';
    c.resourceInventory={paper:21};
    const before=JSON.stringify({m,c});
    const text=materialShortageText(m,c,DEFAULT_TRAINING);
    const row=text.split('\n').find(line=>line.startsWith('メンバー\tpaper\t'))!;
    expect(row.split('\t')).toEqual(['メンバー','paper','架空 素材 名称','個','20','21','0','計算済み小計・必要量と全体の不足は未確定／在庫登録済み']);
    expect(text).not.toContain('\tcopy\t');
    expect(JSON.stringify({m,c})).toBe(before);
  });
});
