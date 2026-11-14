import type { Masterdata } from '../../data/catalog/model';
import { strictObject } from '../../data/json.ts';
import { GACHA_KINDS } from './model.ts';
import type { SealBudgetDefinition, SealBudgetScenario, SealCardRef, DuplicateReward, GachaKind } from './model.ts';
const fail = (): never => { throw new Error('シール予算: 定義・条件または参照が不正です'); };
const id = (v:unknown):string => typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v) ? v : fail();
const name = (v:unknown):string => typeof v==='string' && !!v.trim() && v.length<=200 ? v : fail();
const number = (v:unknown,max=1e9):number|null => v===null ? null : typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=max ? v : fail();
const rows = (v:unknown,max:number):unknown[] => Array.isArray(v) && v.length<=max ? v : fail();
const unique = (v:string[]):void => {if(new Set(v).size!==v.length)fail();};
const cardKey = (r: {kind: string; cardId: number}): string => `${r.kind}:${r.cardId}`;
const positive = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => {
 const n = number(v, max); return n !== null && n > 0 ? n : fail();
};
function cardRef(r: Record<string, unknown>): SealCardRef {
 if (r.kind !== 'member' && r.kind !== 'snap') return fail();
 return {kind: r.kind, cardId: positive(r.cardId)};
}
function reward(v: unknown): DuplicateReward | null {
 if (v === null) return null;
 const r = strictObject(v, 'duplicateReward', ['kind', 'amount'], ['kind']);
 if (r.kind === 'pieces' || r.kind === 'none') {
  if (Object.hasOwn(r, 'amount')) return fail();
  return {kind: r.kind};
 }
 if (r.kind !== 'seals' || !Object.hasOwn(r, 'amount')) return fail();
 return {kind: 'seals', amount: number(r.amount)};
}
export function validateSealBudgetDefinition(value: unknown): SealBudgetDefinition {
 const d = strictObject(value, 'sealBudgetDefinition', ['version', 'revision', 'gachas', 'products', 'pools', 'cards', 'planBenefits'], ['version', 'revision', 'gachas', 'products']);
 if (d.version !== 3) throw new Error('現行のシール予算定義v3を含むマスタを再Importしてください。旧定義・未知の形式は対応していません');
 const products = rows(d.products, 200).map(v => {
  const r = strictObject(v, 'product', ['id', 'name', 'tiers']);
  const tiers = rows(r.tiers, 20).map(v => {
   const t = strictObject(v, 'tier', ['sealCost', 'monthlyLimit']);
   return {sealCost: number(t.sealCost), monthlyLimit: number(t.monthlyLimit)};
  });
  if (!tiers.length) return fail();
  return {id: id(r.id), name: name(r.name), tiers};
 });
 unique(products.map(p => p.id));
 const baseKeys = ['id', 'name', 'draws', 'periodDays', 'pointsPerDraw', 'sealsPerPoint', 'paidStarsPerDraw'];
 const base = (r: Record<string, unknown>) => {
  if (!GACHA_KINDS.includes(r.id as never)) return fail();
  if (typeof r.periodDays !== 'number' || !Number.isFinite(r.periodDays) || r.periodDays < 0.01 || r.periodDays > 1e6) return fail();
  return {id: r.id as GachaKind, name: name(r.name), draws: positive(r.draws, 1e9), periodDays: r.periodDays,
   pointsPerDraw: number(r.pointsPerDraw), sealsPerPoint: number(r.sealsPerPoint), paidStarsPerDraw: number(r.paidStarsPerDraw)};
 };
 const rawGachas = rows(d.gachas, 4);
 if (rawGachas.length !== 4) return fail();
 const revision = id(d.revision);
 const benefits: Pick<SealBudgetDefinition, 'planBenefits'> = {};
 if (Object.hasOwn(d, 'planBenefits')) {
  const plans = strictObject(d.planBenefits, 'planBenefits', ['none', 'lite', 'standard', 'premium']);
  benefits.planBenefits = Object.fromEntries(Object.entries(plans).map(([plan, value]) => {
   const row = strictObject(value, 'planBenefits.' + plan, ['passGachas', 'paidDailyLimit', 'eventDailyLimit', 'basis']);
   if (typeof row.basis !== 'string' || !row.basis.trim() || row.basis.length > 300) return fail();
   const limit = (v: unknown) => v === null ? null : [0, 1, 2].includes(v as number) ? v as 0 | 1 | 2 : fail();
   const passGachas = row.passGachas === null ? null : rows(row.passGachas, 20).map(value => {
    const g = strictObject(value, 'passGachas', ['gachaId', 'draws', 'periodDays', 'poolId'], ['gachaId', 'draws', 'periodDays']);
    if (!['pass', 'paid', 'event'].includes(g.gachaId as string)) return fail();
    if (g.periodDays !== null && (typeof g.periodDays !== 'number' || !Number.isFinite(g.periodDays) || g.periodDays < 0.01 || g.periodDays > 1e6)) return fail();
    const poolId = g.poolId === undefined ? undefined : id(g.poolId);
    if (poolId !== undefined && !rows(d.pools, 200).some(p => (p as {id: unknown}).id === poolId)) return fail();
    return {gachaId: g.gachaId as 'pass' | 'paid' | 'event', draws: g.draws === null ? null : positive(g.draws, 1e9), periodDays: g.periodDays as number | null, ...(poolId === undefined ? {} : {poolId})};
   });
   // A purchase-free plan cannot grant purchased-pass entitlements.
   if (plan === 'none' && (passGachas === null || passGachas.length)) return fail();
   return [plan, {passGachas, paidDailyLimit: limit(row.paidDailyLimit), eventDailyLimit: limit(row.eventDailyLimit), basis: row.basis}];
  })) as NonNullable<SealBudgetDefinition['planBenefits']>;
 }
 const cards = rows(d.cards, 20000).map(v => {
  const r = strictObject(v, 'sealCard', ['kind', 'cardId', 'completedAt', 'duplicateReward']);
  return {...cardRef(r), completedAt: r.completedAt === null ? null : positive(r.completedAt),
   duplicateReward: reward(r.duplicateReward)};
 });
 unique(cards.map(cardKey));
 const rules = new Set(cards.map(cardKey));
 let poolRows = 0;
 const pools = rows(d.pools, 200).map(v => {
  const r = strictObject(v, 'sealPool', ['id', 'probabilityScale', 'cards', 'otherProbability']);
  const probabilityScale = positive(r.probabilityScale, 1e9);
  const cards = rows(r.cards, 20000).map(v => {
   if (++poolRows > 50000) return fail();
   const c = strictObject(v, 'sealPoolCard', ['kind', 'cardId', 'probability']);
   const ref = cardRef(c);
   if (!rules.has(cardKey(ref))) return fail();
   return {...ref, probability: number(c.probability, probabilityScale)};
  });
  unique(cards.map(cardKey));
  const otherProbability = number(r.otherProbability, probabilityScale);
  probabilitySum([...cards.map(c => c.probability), otherProbability], probabilityScale);
  return {id: id(r.id), probabilityScale, cards, otherProbability};
 });
 unique(pools.map(p => p.id));
 const poolIds = new Set(pools.map(p => p.id));
 const gachas = rawGachas.map(v => {
  const r = strictObject(v, 'gacha', [...baseKeys, 'poolId']);
  const poolId = id(r.poolId);
  if (!poolIds.has(poolId)) return fail();
  return {...base(r), poolId};
 });
 unique(gachas.map(g => g.id));
 return {version: 3, revision, gachas, products, pools, cards, ...benefits};
}
function probabilitySum(values: (number | null)[], scale: number): void {
 const sum = values.reduce<number>((sum, p) => sum + (p ?? 0), 0);
 if (sum > scale || (values.every(p => p !== null) && sum !== scale)) fail();
}
/** Validate public card IDs and declared completion stages without inferring game rules. */
export function sealBudgetIssues(master: Masterdata, definition = master.sealBudgetDefinition): string[] {
 if (!definition) return [];
 const issues: string[] = [];
 const members = new Map(master.members.map(c => [c.id, c]));
 const snaps = new Map(master.snaps.map(c => [c.id, c]));
 const memberStages = new Set(master.memberAwakening.map(r => `${r.group}:${r.stage}`));
 const snapStages = new Set(master.snapRanks.map(r => `${r.group}:${r.rank}`));
 for (const rule of definition.cards) {
  const card = rule.kind === 'member' ? members.get(rule.cardId) : snaps.get(rule.cardId);
  const legal = card && ('awakeningGroup' in card
   ? memberStages.has(`${card.awakeningGroup}:${rule.completedAt}`)
   : snapStages.has(`${card.rankGroup}:${rule.completedAt}`));
  if (!card || (rule.completedAt !== null && !legal)) {
   issues.push('sealBudgetDefinition: 参照カードまたは完凸条件に対応する育成段階がありません');
   break;
  }
 }
 return issues;
}
export function validateSealBudgetScenario(value:unknown,definition?:SealBudgetDefinition):SealBudgetScenario {
 const s=strictObject(value,'sealBudgetScenario',['cm','pass','eventFree','paid','event','selectedProducts'],['cm','pass','paid','selectedProducts']);
 if(typeof s.cm!=='boolean'||typeof s.pass!=='boolean'||![0,1,2].includes(s.paid as number))return fail();
 if(s.eventFree!==undefined && typeof s.eventFree!=='boolean')return fail();
 if(s.event!==undefined && ![0,1,2].includes(s.event as number))return fail();
 const selectedProducts=rows(s.selectedProducts,200).map(id);unique(selectedProducts);
 if(definition && selectedProducts.some(id=>!definition.products.some(p=>p.id===id)))fail();
 return {cm:s.cm,pass:s.pass,...(s.eventFree===undefined?{}:{eventFree:s.eventFree}),paid:s.paid as 0|1|2,...(s.event===undefined?{}:{event:s.event as 0|1|2}),selectedProducts};
}
