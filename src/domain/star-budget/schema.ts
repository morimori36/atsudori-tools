import { PASS_GRADES, PRODUCT_IDS } from './model.ts';

const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const text = { type: 'string', maxLength: 300 };
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const measure = (numeric: unknown = integer) => object({ value: nullable(numeric), status: { enum: ['unconfirmed', 'assumed', 'confirmed'] }, basis: text });
const positive = { ...integer, minimum: 1 };
const days = measure({ type: 'number', minimum: 0.01, maximum: Number.MAX_SAFE_INTEGER / 100, multipleOf: 0.01 });
const product = object({ id: { enum: PRODUCT_IDS }, name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' }, unlockRank: measure(positive),
  tiers: { type: 'array', minItems: 1, maxItems: 20, items: object({ starCost: measure(), weeklyLimit: measure() }) } });
export const starBudgetDefinitionSchema = object({ revision: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' },
  loginDaily: measure(), missionDaily: measure(), liveStampWeekly: measure(), liveStampSelection: text,
  event: object({ intervalDays: days, points: measure(), missionFree: measure(), missionPremium: measure(), storyPerEpisode: measure(), storyEpisodes: measure() }),
  season: object({ intervalDays: days, free: measure(), premium: measure() }),
  arena: object({ intervalDays: days, recurringStars: measure() }),
  passes: object(Object.fromEntries(PASS_GRADES.map(grade => [grade, object({ periodDays: days, purchaseStars: measure(), dailyStars: measure(), priceYen: measure() })]))),
  starCompatibility: { enum: ['unconfirmed', 'assumed-usable', 'confirmed-usable', 'restricted'] }, starCompatibilityBasis: text,
  products: { type: 'array', minItems: PRODUCT_IDS.length, maxItems: PRODUCT_IDS.length, items: product },
});
export const starBudgetScenarioSchema = object({ storyEventPercent: nullable({ ...integer, maximum: 100 }),
  eventPremium: { type: 'boolean' }, seasonPremium: { type: 'boolean' }, includeArena: { type: 'boolean' },
  selectedProducts: { type: 'array', maxItems: PRODUCT_IDS.length, uniqueItems: true, items: { enum: PRODUCT_IDS } },
});
