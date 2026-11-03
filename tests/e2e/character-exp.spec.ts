import { test,expect } from '@playwright/test';
import { characterExpFixture,expTraining } from '../helpers/character-exp';
import { openRankInput } from '../helpers/rank-ui';
import { CATALOG_STORAGE_KEY,STORAGE_KEY } from '../../src/storage/local';
import { TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';

for(const width of [1280,390,320])test(`integrated ranks, independent actions and read-only EXP cards at ${width}px`,async({page})=>{
  const {m,c}=characterExpFixture();
  await page.setViewportSize({width,height:844});await page.goto('./');
  await page.evaluate(({m,c,expTraining,keys})=>{[m,c,expTraining].forEach((v,i)=>localStorage.setItem(keys[i]!,JSON.stringify(v)));},{m,c,expTraining,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=progress]').click();
  const saved=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]);
  const char=page.locator('[data-character-rank="8201"]'),bond=char.locator('[data-progress-section="bond-8201"]');
  await expect(char.locator('[data-effective-rank]')).toHaveText('32');await expect(char.locator('[data-rank-source]')).toHaveText('手動上書き中');
  await expect(char.locator('[data-bond-final]')).toHaveText('30');
  await expect(char.locator('[data-exp-owned],[data-exp-unowned]')).toHaveCount(0);
  await expect(char.locator('[data-exp-goal]')).toContainText('0 EXP');
  await expect(page.locator('[data-exp-target]')).toHaveValue('30');await expect(page.locator('[data-exp-target]')).toHaveAttribute('type','number');
  await page.locator('[data-exp-target]').fill('32');await page.locator('[data-exp-target]').press('Enter');
  await expect(char.locator('[data-exp-goal]')).toContainText('13 EXP');
  for(const invalid of ['31','0','30.5','']) {
    await page.locator('[data-exp-target]').fill(invalid);await page.locator('[data-exp-target]').press('Enter');
    await expect(page.locator('#exp-target-error')).toContainText('合法ランク');await expect(char.locator('[data-exp-goal]')).toContainText('13 EXP');
  }
  await page.locator('[data-exp-target]').fill('28');await page.locator('[data-exp-target]').press('Enter');await expect(page.locator('#exp-target-error')).toBeEmpty();
  await expect(char.locator('[aria-label="最終絆合計"]')).toBeHidden();
  await expect(char.locator('[data-progress-section="rank-input-8201"]')).not.toHaveAttribute('open','');
  const open=char.getByRole('button',{name:'カード別EXP',exact:true});await open.focus();await open.press('Enter');
  const dialog=page.getByRole('dialog',{name:'架空奏者Aのカード別EXP'});await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-exp-kind-section] > h3')).toHaveText(['メンバー','スナップ']);
  await expect(dialog.locator('[data-exp-ownership],[data-exp-kind],[data-exp-positive]')).toHaveCount(0);
  await expect(dialog.locator('[data-exp-card]')).toHaveCount(8); // zero deltas remain discoverable
  const owned=dialog.locator('[data-exp-card="member-8301"]'),unowned=dialog.locator('[data-exp-card="member-8303"]');
  await expect(owned).toHaveClass(/is-owned/);await expect(unowned).not.toHaveClass(/is-owned/);
  await expect(owned.locator('[data-exp-direct]')).toHaveText('直接EXP +0 EXP');await expect(unowned.locator('[data-exp-direct]')).toHaveText('直接EXP +0 EXP');
  await expect(owned.locator('.stage-projection').first().locator('.is-current')).toHaveText('1現在');
  await expect(owned.locator('.stage-projection').first().locator('.is-target')).toHaveText('2目標');
  await expect(unowned.locator('.is-current')).toHaveCount(0);await expect(unowned.locator('.derived-level')).toContainText('現在 未所持');
  await expect(owned.locator('.stage-projection')).toHaveCount(4);await expect(dialog.locator('[data-exp-card="snap-8505"] .stage-projection')).toHaveCount(1);
  await expect(dialog.locator('[data-ownership-toggle],input[type=radio],select')).toHaveCount(0);
  await dialog.getByRole('button',{name:'閉じる',exact:true}).focus();await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('[data-exp-result] > summary').last()).toBeFocused();await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'閉じる',exact:true})).toBeFocused();
  await expect(owned.locator('.card-name')).toHaveText(m.members[0]!.name);await expect(owned.locator('.rarity-badge')).toHaveAttribute('data-rarity',String(m.members[0]!.rarity));
  await dialog.locator('[data-exp-result="snap-8505"] summary').click();await expect(dialog.locator('[data-exp-card="snap-8505"] [data-exp-final]')).toContainText('最終ランク 30');
  await dialog.locator('[data-exp-query]').fill('8303');await expect(dialog.locator('[data-exp-card]')).toHaveCount(1);
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
  await bond.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(char.locator('.bond-pairs')).toBeVisible();await expect(char.locator('[aria-label="最終絆合計"]')).toHaveText('28');
  await openRankInput(page);await page.locator('#rank-8201').fill('28');
  await expect(char.locator('[data-effective-rank]')).toHaveText('28');await expect(char.locator('[data-bond-final]')).toHaveText('30');
  await page.getByRole('button',{name:'育成条件を変更'}).click();
  await page.getByRole('dialog',{name:'育成条件',exact:true}).locator('[data-training=awakeningStage]').selectOption('');
  await page.getByRole('dialog',{name:'育成条件',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(bond).toHaveAttribute('open','');await expect(page.locator('#rank-8201')).toHaveValue('28');
  await expect(page.locator('[data-exp-target]')).toHaveValue('28');
  await page.locator('[data-exp-target]').fill('32');await page.locator('[data-exp-target]').press('Enter');
  await expect(char.locator('[data-exp-goal]')).toContainText('29 EXP'); // trained 51 EXP, missing 80-51
  await open.click();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'閉じる',exact:true}).click();await expect(open).toBeFocused();
  expect(await char.evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(width<700?224:192);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[CATALOG_STORAGE_KEY,STORAGE_KEY])).toEqual(saved.slice(0,2));
  await char.locator('[data-progress-section="rank-input-8201"] > summary').click();
  await page.screenshot({path:`test-results/character-ranks-${width}.png`,fullPage:true});
  await open.click();await page.screenshot({path:`test-results/character-exp-${width}.png`});
  await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const close=dialog.getByRole('button',{name:'閉じる',exact:true});await expect(close).toBeInViewport();await close.click();await expect(open).toBeFocused();
});

test('EXP sections page independently, search all candidates and retain pending values',async({page})=>{
  const {m,c}=characterExpFixture();m.members.push(...Array.from({length:23},(_,i)=>({...m.members[0]!,id:8400+i,name:`架空の追加紙${i}`})));
  delete m.rankDefinition;
  await page.goto('./');await page.evaluate(({m,c,keys})=>{localStorage.setItem(keys[0]!,JSON.stringify(m));localStorage.setItem(keys[1]!,JSON.stringify(c));},{m,c,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=progress]').click();
  const char=page.locator('[data-character-rank="8201"]');await expect(char.locator('[data-exp-goal]')).toContainText('未算出');
  await char.getByRole('button',{name:'カード別EXP',exact:true}).click();const dialog=page.getByRole('dialog');
  await expect(dialog.locator('[data-exp-kind-section="member"] [data-exp-card]')).toHaveCount(20);
  await expect(dialog.locator('[data-exp-kind-section="snap"] [data-exp-card]')).toHaveCount(4);
  await expect(dialog.locator('[data-exp-direct]').first()).toContainText('未算出');await dialog.locator('[data-exp-more="member"]').click();await expect(dialog.locator('[data-exp-kind-section="member"] [data-exp-card]')).toHaveCount(27);
  await dialog.locator('[data-exp-query]').fill('追加紙22');await expect(dialog.locator('[data-exp-card]')).toHaveCount(1);
});

test('positive single-card deltas use current owned and fully-trained acquisition baselines',async({page})=>{
  const {m,c}=characterExpFixture();c.members=[c.members[0]!];c.snaps=[c.snaps[0]!];
  await page.goto('./');await page.evaluate(({m,c,settings,keys})=>{[m,c,settings].forEach((v,i)=>localStorage.setItem(keys[i]!,JSON.stringify(v)));},{m,c,settings:expTraining,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=progress]').click();await page.locator('[data-exp-detail="8201"]').click();
  const dialog=page.getByRole('dialog');
  // Acquisition of a second trained member crosses the two-member thresholds: 11+13+3.
  await expect(dialog.locator('[data-exp-card="member-8302"] [data-exp-direct]')).toHaveText('直接EXP +27 EXP');
  await expect(dialog.locator('[data-exp-card="snap-8504"] [data-exp-direct]')).toHaveText('直接EXP +17 EXP');
  // Training the only owned Snap alone does not reach the threshold of two.
  await expect(dialog.locator('[data-exp-card="snap-8501"] [data-exp-direct]')).toHaveText('直接EXP +0 EXP');
});

for(const width of [1280,390,320])test(`five-stage read-only cards distinguish current 2 and target 4 at ${width}px`,async({page})=>{
  const {m,c}=characterExpFixture();
  for(const stage of [3,4,5]){
    m.memberTraining.push({...m.memberTraining[1]!,stage});
    m.memberAwakening.push({...m.memberAwakening[1]!,stage,leaderSkillLevel:stage});
    m.memberLevelLimits.push({rarity:4,trainingStage:stage,limitLevel:2});
    m.snapRanks.push({...m.snapRanks[1]!,rank:stage,supportSkillLevels:[stage,stage]});
  }
  for(const member of m.members){member.liveSkillLevels=[1,2,3,4,5];member.gekisouSkillLevels=[1,2,3,4,5];}
  c.members[0]!.trainingStage=2;c.members[0]!.level=2;c.snaps[0]!.rank=2;c.snaps[0]!.level=2;
  const settings={trainingStage:4,awakeningStage:4,liveSkillLevel:4,gekisouSkillLevel:4,snapRank:4};
  await page.setViewportSize({width,height:844});await page.goto('./');
  await page.evaluate(({m,c,settings,keys})=>{[m,c,settings].forEach((v,i)=>localStorage.setItem(keys[i]!,JSON.stringify(v)));},{m,c,settings,keys:[CATALOG_STORAGE_KEY,STORAGE_KEY,TRAINING_STORAGE_KEY]});
  await page.reload();await page.locator('nav [data-tab=progress]').click();await page.locator('[data-exp-detail="8201"]').click();
  const dialog=page.getByRole('dialog'),stages=dialog.locator('[data-exp-card="member-8301"] .stage-projection').first();
  await expect(stages.locator('[role=listitem]')).toHaveCount(5);await expect(stages.locator('.is-current')).toHaveText('2現在');await expect(stages.locator('.is-target')).toHaveText('4目標');
  for(const row of await dialog.locator('.stage-projection').all())expect(await row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.locator('[data-exp-query]').fill('8301');
  await page.screenshot({path:`test-results/character-exp-five-stages-${width}.png`});
  await page.keyboard.press('Escape');await page.locator('nav [data-tab=members]').click();
  await page.locator('[data-filter="query"]').fill('8301');await page.screenshot({path:`test-results/collection-reference-${width}.png`});
});
