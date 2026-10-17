import { describe, expect, it } from 'vitest';
import { SIZE_COST } from '../src/config';

describe('config', () => {
  it('sizes cost increases', () => {
    expect(SIZE_COST.S.pct).toBeLessThan(SIZE_COST.L.pct);
  });
});
