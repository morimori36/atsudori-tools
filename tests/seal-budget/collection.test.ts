import {it, expect} from 'vitest';
import Ajv from 'ajv/dist/2020';
import {readFileSync} from 'node:fs';
import {collectionSealFixture} from '../helpers/seal-budget';
import {calculateSealBudget} from '../../src/domain/seal-budget/calculate';
import {calculateCollectionSealBudget} from '../../src/app/seal-budget';
import {defaultSealBudgetScenario} from '../../src/domain/seal-budget/model';
import {validateSealBudgetDefinition} from '../../src/domain/seal-budget/validate';
import {importCatalog, exportCatalog, validateCatalog, catalogIssues} from '../../src/data/catalog/validate';
import {importCollection, exportCollection} from '../../src/storage/collection';
import {prepareCollectionImport} from '../../src/storage/collection-import';
import {loadCatalog, loadCollection, saveCatalog, saveCollection, CATALOG_STORAGE_KEY, STORAGE_KEY} from '../../src/storage/local';
const scenario = () => ({...defaultSealBudgetScenario(), cm: true, pass: true, paid: 1 as const, selectedProducts: ['fictional-paper']});

it('uses only completed starting ownership', () => {
 const {master, collection} = collectionSealFixture();
 expect(calculateCollectionSealBudget(master, collection, scenario())).toMatchObject({
  totalIncome: 2880, totalExpense: 67, balance: 2813, notes: [],
 });
});

it.each(['member', 'snap'] as const)('uses current %s ownership, not a duplicate flag or training level', kind => {
 const {master, collection} = collectionSealFixture();
 const run = () => calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0});
 if (kind === 'member') collection.members = collection.members.filter(c => c.cardId !== 8301);
 else collection.snaps = collection.snaps.filter(c => c.supportCardId !== 8501);
 expect(run().totalIncome).toBe(2640); // first acquisition is retained
 const owned = kind === 'member'
  ? {cardId: 8301, level: 1, trainingStage: 1, awakeningStage: 1, liveSkillLevel: 1, gekisouSkillLevel: 1}
  : {supportCardId: 8501, level: 1, rank: 1};
 if (owned.cardId !== undefined) collection.members.push(owned); else collection.snaps.push(owned);
 expect(run().totalIncome).toBe(2640); // duplicate -> pieces, no immediate seals
 if (owned.cardId !== undefined) {
  owned.trainingStage = 2; owned.level = 2;
  expect(run().totalIncome).toBe(2640); // max training/Lv is NOT completion
  owned.awakeningStage = 2;
 } else owned.rank = 2;
 const original = JSON.stringify(collection);
 expect(run().totalIncome).toBe(kind === 'member' ? 2874 : 3606);
 expect(JSON.stringify(collection)).toBe(original);
});

it('sums per-card probabilities and distinct pickup pools; preserves Pt and independent counts', () => {
 const {master, collection} = collectionSealFixture();
 collection.members[0]!.awakeningStage = 2; collection.snaps[0]!.rank = 2;
 const r = calculateCollectionSealBudget(master, collection, {...scenario(), event: 2});
 expect(r.income[0]).toMatchObject({member: 474, snap: 1686, points: 1680, total: 3840});
 expect(r.income[2]).toMatchObject({member: 118.5, snap: 421.5, points: 0, total: 540});
 // featured = .100001*10 + .099999*20 + .6*13 + .2*23 = 15.39999/draw
 expect(r.income[3]!.member).toBeCloseTo(528.0006, 7);
 expect(r.income[3]!.snap).toBeCloseTo(395.9988, 7);
 expect(r.income[3]!.points).toBe(840);
 expect(r.totalIncome).toBeCloseTo(6143.9994, 7);
 expect(r.totalExpense).toBe(67); expect(r.balance).toBeCloseTo(6076.9994, 7);
});

it('does not average same-rarity cards or count cards absent from the selected pool', () => {
 const {master, collection, definition} = collectionSealFixture();
 master.members[1]!.rarity = 4; // both members have the same rarity
 collection.members[0]!.awakeningStage = 2;
 definition.gachas[0]!.poolId = 'featured';
 const result = calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0});
 expect(result.income[0]!.member).toBeCloseTo(1056.0012, 7); // (1.00001 + 7.8)*120
 expect(result.income[1]!.total).toBe(0); // empty non-card pool
 definition.pools[1]!.cards = definition.pools[1]!.cards.filter(c => c.cardId !== 8301);
 definition.pools[1]!.otherProbability = 600000;
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).income[0]!.member).toBeCloseTo(120.0012, 7);
});

it('distinguishes an unknown snapshot from an empty collection and retains Pt income', () => {
 const {master, collection} = collectionSealFixture();
 const original = JSON.stringify(collection);
 const unknown = calculateCollectionSealBudget(master, null, scenario());
 expect(unknown).toMatchObject({totalIncome: 1680, totalExpense: 67, balance: 1613});
 expect(unknown.notes).toHaveLength(2); // one concise note per active card pool
 expect(calculateSealBudget(master.sealBudgetDefinition!, scenario()).totalIncome).toBe(1680);
 const empty = {...collection, members: [], snaps: []};
 expect(calculateCollectionSealBudget(master, empty, scenario())).toMatchObject({totalIncome: 1680, notes: []});
 expect(JSON.stringify(collection)).toBe(original);
});

it.each(['completion', 'conversion', 'amount', 'probability'] as const)('excludes only unknown %s contribution, preserves source nulls', kind => {
 const {master, collection, definition} = collectionSealFixture();
 if (kind === 'completion') definition.cards[0]!.completedAt = null;
 if (kind === 'conversion') definition.cards[0]!.duplicateReward = null;
 if (kind === 'amount') definition.cards[0]!.duplicateReward = {kind: 'seals', amount: null};
 if (kind === 'probability') definition.pools[0]!.cards[0]!.probability = null;
 const original = JSON.stringify({master, collection});
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0})).toMatchObject({totalIncome: 2400, totalExpense: 67, balance: 2333});
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).notes).toHaveLength(1);
 expect(JSON.stringify({master, collection})).toBe(original);
});

it('counts only completed duplicates with a declared seal reward', () => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.duplicateReward = {kind: 'pieces'};
 definition.cards[2]!.duplicateReward = {kind: 'seals', amount: 4};
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).totalIncome).toBe(2400); // 720+1680; incomplete duplicates never contribute
 definition.cards[2]!.duplicateReward = {kind: 'none'};
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).totalIncome).toBe(2400);
});

it('does not infer completion from a declared reward, but keeps known zero outcomes', () => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.completedAt = null;
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0})).toMatchObject({totalIncome: 2400, notes: ['架空の日次抽選の完凸条件は未確認のため除外']});
 definition.cards.forEach(c => {c.completedAt = null; c.duplicateReward = {kind: 'none'};});
 expect(calculateCollectionSealBudget(master, null, {...scenario(), paid: 0})).toMatchObject({totalIncome: 1680, notes: []});
});

it('skips zero probabilities, unselected pools and known zero conversion without warnings', () => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.completedAt = null;
 definition.pools[0]!.cards[0]!.probability = 0;
 definition.pools[0]!.otherProbability = 2000;
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0})).toMatchObject({totalIncome: 2400, notes: []});
 definition.pools[0]!.cards[2]!.probability = null; // incomplete -> known pieces -> 0
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).notes).toEqual([]);
 definition.pools[0]!.otherProbability = null;
 expect(calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0}).notes).toHaveLength(1);
 expect(calculateCollectionSealBudget(master, collection, defaultSealBudgetScenario())).toMatchObject({totalIncome: 0, notes: []});
});

const schema = new Ajv({strict: true}).compile(JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json', 'utf8')));
it('round trips definition v3 and existing collection without new ownership fields or writes on read', () => {
 const {master, collection} = collectionSealFixture();
 collection.sealBudgetScenario = scenario();
 expect(schema(master), JSON.stringify(schema.errors)).toBe(true);
 expect(importCatalog(exportCatalog(master))).toEqual(master);
 expect(importCollection(exportCollection(collection, master), master)).toEqual(collection);
 const data = new Map<string, string>();
 const storage = {getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => {data.set(k, v);}};
 expect(saveCatalog(storage, master).status).toBe('saved');
 expect(saveCollection(storage, collection, master).status).toBe('saved');
 const original = [...data];
 expect(loadCatalog(storage).status).toBe('loaded'); expect(loadCollection(storage, master).status).toBe('loaded');
 calculateCollectionSealBudget(master, collection);
 expect([...data]).toEqual(original);
 expect([...data.keys()].sort()).toEqual([CATALOG_STORAGE_KEY, STORAGE_KEY].sort());
 const incoming = {...collection, members: [], snaps: []}; delete incoming.sealBudgetScenario;
 const merged = prepareCollectionImport(incoming, collection, master);
 expect(merged.sealBudgetScenario).toEqual(scenario());
 expect(calculateCollectionSealBudget(master, merged).totalIncome).toBe(1680);
});

it.each(['bad pool', 'bad rule', 'duplicate rule', 'duplicate pool', 'duplicate card', 'negative', 'fractional', 'bad sum', 'bad scale', 'missing cards', 'bad outcome', 'missing amount', 'extra gacha field', 'future version'])(
 'rejects invalid v3 definition: %s', kind => {
 const {definition: d, master} = collectionSealFixture();
 if (kind === 'bad pool') d.gachas[0]!.poolId = 'absent';
 if (kind === 'bad rule') d.cards.pop();
 if (kind === 'duplicate rule') d.cards.push(d.cards[0]!);
 if (kind === 'duplicate pool') d.pools.push(d.pools[0]!);
 if (kind === 'duplicate card') d.pools[0]!.cards.push(d.pools[0]!.cards[0]!);
 if (kind === 'negative') d.pools[0]!.cards[0]!.probability = -1;
 if (kind === 'fractional') d.pools[0]!.cards[0]!.probability = .1;
 if (kind === 'bad sum') d.pools[0]!.cards[0]!.probability = 2001;
 if (kind === 'bad scale') d.pools[0]!.probabilityScale = 0;
 if (kind === 'missing cards') delete (d as Partial<typeof d>).cards;
 if (kind === 'bad outcome') Object.assign(d.cards[0]!, {duplicateReward: {kind: 'pieces', amount: 0}});
 if (kind === 'missing amount') d.cards[0]!.duplicateReward = {kind: 'seals'} as never;
 if (kind === 'extra gacha field') Object.assign(d.gachas[0]!, {retiredField: 2000});
 if (kind === 'future version') Object.assign(d, {version: 4});
 expect(() => validateSealBudgetDefinition(d)).toThrow();
 // References and sums require semantic validation, independent of structural Schema.
 if (!['bad pool', 'bad rule', 'duplicate rule', 'duplicate pool', 'duplicate card', 'bad sum'].includes(kind)) expect(schema(master)).toBe(false);
});

it.each(['card', 'member stage', 'snap stage'] as const)('rejects broken %s references on import and calculation', kind => {
 const {master, collection, definition} = collectionSealFixture();
 if (kind === 'card') {definition.cards[0]!.cardId = 999999; definition.pools.forEach(p => p.cards.forEach(c => {if(c.cardId === 8302)c.cardId = 999999;}));}
 if (kind === 'member stage') definition.cards[0]!.completedAt = 8;
 if (kind === 'snap stage') definition.cards[1]!.completedAt = 8;
 expect(catalogIssues(validateCatalog(master))).not.toEqual([]);
 expect(() => importCatalog(JSON.stringify(master))).toThrow('不整合');
 expect(() => calculateCollectionSealBudget(master, collection, scenario())).toThrow();
});

it('rejects inconsistent ownership and arithmetic overflow instead of treating them as unknown', () => {
 const {master, collection, definition} = collectionSealFixture();
 expect(() => calculateCollectionSealBudget(master, {...collection, catalogId: 'another'}, scenario())).toThrow();
 expect(() => calculateCollectionSealBudget(master, {...collection, members: [...collection.members, collection.members[0]!]}, scenario())).toThrow();
 expect(() => calculateCollectionSealBudget(master, {...collection, snaps: [{...collection.snaps[0]!, rank: 8}]}, scenario())).toThrow();
 definition.gachas[0]!.draws = 1e9; definition.gachas[0]!.periodDays = .01;
 definition.cards[0]!.duplicateReward = {kind: 'seals', amount: 1e9};
 expect(() => calculateCollectionSealBudget(master, collection, scenario())).toThrow('計算範囲');
});

it.each(['unowned', 'partial', 'complete'] as const)('uses a shared virtual pool with %s starting ownership', state => {
 const {master, collection, definition} = collectionSealFixture();
 definition.gachas.forEach(g => {g.poolId = 'ordinary';});
 if (state === 'unowned') {collection.members = []; collection.snaps = [];}
 if (state === 'complete') {
  collection.members.forEach(c => {c.awakeningStage = 2;});
  collection.snaps.forEach(c => {c.rank = 2;});
 }
 const conditions = {...scenario(), pass: false, event: 1 as const};
 const before = structuredClone({master, collection, conditions});
 const r = calculateCollectionSealBudget(master, collection, conditions);
 // 180 draws of cards; only 150 draws exchange 14 Pt-seals each.
 expect(r.totalIncome).toBe(state === 'unowned' ? 2100 : state === 'partial' ? 3540 : 5340);
 expect(r.notes).toEqual([]);
 expect({master, collection, conditions}).toEqual(before);
});

it('retains known contributions and deduplicates each actual unknown cause across free entitlements', () => {
 const {master, collection, definition} = collectionSealFixture();
 definition.cards[0]!.completedAt = null;
 definition.cards[1]!.duplicateReward = null;
 collection.members[0]!.awakeningStage = 2;
 definition.pools[0]!.cards[2]!.probability = null;
 definition.planBenefits!.lite = {passGachas: [
  {gachaId: 'pass', draws: 1, periodDays: 30, poolId: 'ordinary'},
  {gachaId: 'pass', draws: 1, periodDays: 30, poolId: 'ordinary'},
 ], paidDailyLimit: null, eventDailyLimit: 2, basis: '独立した架空条件'};
 collection.starBudgetScenario = {storyEventPercent: null, eventPremium: false, seasonPremium: false,
  passPlan: 'lite', selectedProducts: []};
 const conditions = scenario();
 const before = structuredClone({master, collection, conditions});
 const r = calculateCollectionSealBudget(master, collection, conditions);
 // All contributing cards are unknown, except the incomplete snap (known zero).
 // CM Pt = 120*14; pass Pt is explicitly 0; paid unknown limit contributes 0.
 expect(r).toMatchObject({totalIncome: 1680, totalExpense: 67, balance: 1613});
 expect(r.notes).toHaveLength(7); // three causes per active gacha, plus paid limit
 expect(new Set(r.notes).size).toBe(r.notes.length);
 expect(r.notes).toContain('架空の日次抽選の提供割合は未確認のため除外');
 expect(r.notes).toContain('架空の日次抽選の完凸条件は未確認のため除外');
 expect(r.notes).toContain('架空の日次抽選のシール報酬は未確認のため除外');
 expect({master, collection, conditions}).toEqual(before);
});

it('gives zero-probability completed cards no income or warning', () => {
 const {master, collection, definition} = collectionSealFixture();
 definition.pools[0]!.cards[0]!.probability = 0;
 definition.pools[0]!.otherProbability = 2000;
 const r = calculateCollectionSealBudget(master, collection, {...scenario(), paid: 0});
 expect(r).toMatchObject({totalIncome: 2400, notes: []});
});

it.each([
 {unknown: false, probability: 2000, valid: true},
 {unknown: false, probability: 1999, valid: false},
 {unknown: false, probability: 2001, valid: false},
 {unknown: true, probability: 2000, valid: true},
 {unknown: true, probability: 1999, valid: true},
 {unknown: true, probability: 2001, valid: false},
])('preserves probability totals: %o', ({unknown, probability, valid}) => {
 const {definition} = collectionSealFixture();
 definition.pools[0]!.cards[0]!.probability = probability;
 if (unknown) definition.pools[0]!.otherProbability = null;
 const check = () => validateSealBudgetDefinition(definition);
 if (valid) expect(check()).toEqual(definition); else expect(check).toThrow();
});
