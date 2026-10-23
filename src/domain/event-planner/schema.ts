import { CHALLENGE_RANKS, EVENT_FORMAT, MAX_CANDIDATES, MAX_SEARCH_UNITS, NORMAL_RANKS } from './model.ts';

const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const decimal = { type: 'number', minimum: 0, maximum: Number.MAX_SAFE_INTEGER / 100, multipleOf: 0.01 };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const candidates = (ranks: readonly string[]) => ({ type: 'array', maxItems: MAX_CANDIDATES, items: object({
  name: { type: 'string', maxLength: 200 }, enabled: { type: 'boolean' }, rank: { enum: ranks }, bonus: decimal,
}) });
export const eventPlannerSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://morimori36.github.io/atsudori-tools/schemas/event-planner-v1.schema.json',
  title: 'atsudori-tools event planner v1',
  description: 'Independent event planner input. See docs/event-planner.md for units, precision and search limits.',
  ...object({ format: { const: EVENT_FORMAT }, schemaVersion: { const: 1 }, targetPt: integer, currentPt: integer, currentCP: integer,
    normalMultiplier: { ...integer, minimum: 1 }, minutesPerRun: { ...decimal, minimum: 0.01 }, maxUnits: { ...integer, maximum: MAX_SEARCH_UNITS },
    normal: candidates(NORMAL_RANKS), challenge: candidates(CHALLENGE_RANKS), bases: object({
      normal: object(Object.fromEntries(NORMAL_RANKS.map(rank => [rank, object({ pt: integer, cp: integer })]))),
      challenge: object(Object.fromEntries(CHALLENGE_RANKS.map(rank => [rank, object({ pt: integer })]))),
    }),
  }),
};
