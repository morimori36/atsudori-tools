import { expect,test } from 'vitest';
import { materialConsumers,createMaterialsPage } from '../../src/ui/materials';
import { createTrainingSettings } from '../../src/storage/training-settings';
import { simulateTrainingEvaluation } from '../../src/app/training-simulation';
import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';
import { maximumTrainingFixture } from '../helpers/maximum-training';

test('reverse index preserves totals, separate axes and shared Snap identity',()=>{
  const {m,c}=maximumTrainingFixture();
  const result=simulateTrainingEvaluation(m,c,{...DEFAULT_TRAINING,awakeningStage:2});
  const indexed=materialConsumers(result.materials);
  for(const total of result.materials.totals)expect(indexed.get(total.resourceId)!.reduce((n,r)=>n+r.quantity,0)).toBe(total.quantity);
  expect(indexed.get('paper')!.map(r=>[r.axis.axis,r.quantity])).toEqual([['trainingStage',7],['awakeningStage',11],['liveSkillLevel',13]]);
  expect(indexed.get('snap-exp')!.map(r=>[r.card.cardId,r.quantity])).toEqual([[8501,63],[8504,63]]);
  expect([...indexed.values()].flat().some(r=>r.axis.status==='unavailable')).toBe(false);
  expect(indexed.get('member-exp')![0]!.axis.status).toBe('calculated');
});

test('materials render separate numeric columns including EXP and unknown stock',()=>{
  const {m,c}=maximumTrainingFixture();c.resourceInventory={'member-exp':20,'snap-exp':200,paper:0};
  const settings=createTrainingSettings(undefined);
  const before=JSON.stringify(c);
  const html=createMaterialsPage(m,c,settings).html;
  const row=(id:string)=>html.match(new RegExp(`data-material-resource="${id}"><summary[^>]*>(.*?)</summary>`))![1]!;
  expect(html).toContain('<span>素材名</span><span>必要</span><span>在庫</span><span>不足</span>');
  expect(row('member-exp')).toContain('<strong data-material-required>43</strong><span data-material-stock>20</span><strong data-material-shortage class="material-shortage">23</strong>');
  expect(row('snap-exp')).toContain('<span data-material-stock>200</span><strong data-material-shortage class="">0</strong>');
  expect(row('paper')).toContain('<span data-material-stock>0</span><strong data-material-shortage class="material-shortage">20</strong>');
  delete c.resourceInventory.paper;
  const unknown=createMaterialsPage(m,c,settings).html;
  expect(unknown).toContain('<span data-material-stock>—</span><strong data-material-shortage class="">—</strong>');
  expect(html).not.toMatch(/（上限）|途中EXP|上限見積もり/);
  expect(html).toContain('計算済み小計：必要・不足は計算済み分に対する値です。全体の不足は未確定です。');
  c.resourceInventory.paper=0;expect(JSON.stringify(c)).toBe(before);
});
