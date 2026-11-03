import { describe, expect, it } from 'vitest';
import { cardBadges, cardIdentity, rarity } from '../../src/ui/card-identity';
import { trainingSettingsMarkup } from '../../src/ui/training-settings';
import { createTrainingSettings } from '../../src/storage/training-settings';

describe('shared card identification', () => {
  it.each([[2,'R'],[3,'SR'],[4,'SSR'],[10,'EX'],[20,'BD'],[99,'レアリティ99']] as const)('retains catalog rarity %i as %s', (code,label) => {
    expect(rarity(code)).toBe(label);
    expect(cardBadges({rarity:code,cardType:7})).toContain(`data-rarity="${code}">${label}`);
  });
  it('escapes imported names without replacing their content and keeps unknown types neutral', () => {
    const html=cardIdentity({rarity:4,cardType:7,name:'Member <Snap>',title:'"紙" & 凧'});
    expect(html).toContain('Member &lt;Snap&gt;［&quot;紙&quot; &amp; 凧］');
    expect(html).toContain('色 7');
    expect(html).toContain('--card-color: #6d6e81');
  });
  it.each([[1,'紅赤'],[2,'紺碧'],[3,'翡翠'],[4,'山吹'],[5,'紫苑']] as const)('uses the shared type label for %i', (cardType,label) => {
    expect(cardBadges({rarity:3,cardType})).toContain(`class="card-type-label">${label}`);
  });
});

it('groups the five display targets and abbreviates unchanged values without mutating settings', () => {
  const store=createTrainingSettings(undefined), before=store.current();
  const html=trainingSettingsMarkup(store);
  expect(html).toContain('aria-label="育成条件"');
  expect(html).toContain('<h3>メンバー</h3>');
  expect(html).toContain('<h3>スナップ</h3>');
  expect(html).toContain('data-training-summary="awakeningStage"><dt>覚醒</dt><dd>—</dd>');
  expect(html).toContain('data-training-summary="snapRank"><dt>上限解放</dt><dd>—</dd>');
  expect(html.match(/data-training-summary=/g)).toHaveLength(5);
  expect(store.current()).toEqual(before);
});
