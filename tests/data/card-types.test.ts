import { describe, expect, it } from 'vitest';
import { cardTypeName, cardTypeAccent } from '../../src/data/catalog/card-types';

describe('color display', () => {
  it('uses the defined labels and keeps a fallback for unknown IDs', () => {
    expect([1, 2, 3, 4, 5, 7].map(cardTypeName)).toEqual(['紅赤', '紺碧', '翡翠', '山吹', '紫苑', '色 7']);
    expect(cardTypeAccent(1)).toBe('#c74355');
  });
});
