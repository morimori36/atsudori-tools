const integer = {type: 'integer', minimum: 0, maximum: 1e9};
const positiveId = {type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER};
const nullable = (value: unknown) => ({anyOf: [value, {type: 'null'}]});
const id = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'};
const name = {type: 'string', minLength: 1, maxLength: 200, pattern: '\\S'};
const object = (properties: Record<string, unknown>) => ({type: 'object', additionalProperties: false, required: Object.keys(properties), properties});
const baseGacha = {id: {enum: ['cm', 'pass', 'paid', 'event']}, name, draws: {...integer, minimum: 1}, periodDays: {type: 'number', minimum: 0.01, maximum: 1e6},
  pointsPerDraw: nullable(integer), sealsPerPoint: nullable(integer), paidStarsPerDraw: nullable(integer)};
const products = {type: 'array', maxItems: 200, items: object({id, name, tiers: {type: 'array', minItems: 1, maxItems: 20, items: object({sealCost: nullable(integer), monthlyLimit: nullable(integer)})}})};
const gachas = (item: unknown) => ({type: 'array', minItems: 4, maxItems: 4, items: item});
const fixed = object({version: {const: 2}, revision: id, products,
  gachas: gachas(object({...baseGacha,
    memberProbabilityBp: nullable({...integer, maximum: 10000}), snapProbabilityBp: nullable({...integer, maximum: 10000}), otherProbabilityBp: nullable({...integer, maximum: 10000}),
    memberSeals: nullable(integer), snapSeals: nullable(integer)})),
});
const ref = {kind: {enum: ['member', 'snap']}, cardId: positiveId};
const reward = {anyOf: [{type: 'null'}, object({kind: {enum: ['pieces', 'none']}}), object({kind: {const: 'seals'}, amount: nullable(integer)})]};
const collection = object({version: {const: 3}, revision: id, products,
  gachas: gachas(object({...baseGacha, poolId: id})),
  cards: {type: 'array', maxItems: 20000, items: object({...ref, completedAt: nullable(positiveId), beforeCompletion: reward, afterCompletion: reward})},
  pools: {type: 'array', maxItems: 200, items: object({id, probabilityScale: {...integer, minimum: 1},
    cards: {type: 'array', maxItems: 20000, items: object({...ref, probability: nullable(integer)})}, otherProbability: nullable(integer)})},
});
const planBenefits = object(Object.fromEntries(['none', 'lite', 'standard', 'premium'].map(plan => [plan, object({
  passGachas: nullable({type: 'array', maxItems: 20, items: {
    ...object({gachaId: {enum: ['pass', 'paid', 'event']}, draws: nullable({...integer, minimum: 1}),
      periodDays: nullable(baseGacha.periodDays)}),
    properties: {gachaId: {enum: ['pass', 'paid', 'event']}, draws: nullable({...integer, minimum: 1}),
      periodDays: nullable(baseGacha.periodDays), poolId: id},
  }}),
  paidDailyLimit: nullable({enum: [0, 1, 2]}), eventDailyLimit: nullable({enum: [0, 1, 2]}),
  basis: {type: 'string', minLength: 1, maxLength: 300, pattern: '\\S'},
})])));
export const sealBudgetDefinitionSchema = {oneOf: [fixed, collection].map(schema => ({
  ...schema, properties: {...schema.properties, planBenefits},
}))};
const scenario = object({cm: {type: 'boolean'}, pass: {type: 'boolean'}, paid: {enum: [0, 1, 2]}, selectedProducts: {type: 'array', maxItems: 200, uniqueItems: true, items: id}});
export const sealBudgetScenarioSchema = {...scenario, required: ['cm', 'pass', 'paid', 'selectedProducts'], properties: {...scenario.properties, event: {enum: [0, 1, 2]}}};
