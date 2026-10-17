import { describe, expect, it } from 'vitest';
import { formatMoney } from '../src/format';

describe('formatMoney', () => {
  it('formats USD cents', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(-5)).toBe('-$0.05');
  });
});
