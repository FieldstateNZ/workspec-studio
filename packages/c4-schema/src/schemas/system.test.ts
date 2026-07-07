import { describe, expect, it } from 'vitest';
import { systemFactory } from '../../test/helpers/factories.js';
import { SystemElement } from './system.js';

describe('SystemElement', () => {
  it('accepts a minimal system', () => {
    const result = SystemElement.safeParse(systemFactory());
    expect(result.success).toBe(true);
  });

  it('accepts a null summary', () => {
    const result = SystemElement.safeParse(systemFactory({ summary: null }));
    expect(result.success).toBe(true);
  });

  it('accepts every optional lifecycle field', () => {
    const result = SystemElement.safeParse(
      systemFactory({
        phase: 'delivery',
        current_phase: 'S2',
        slice_prefix: 'ledger',
        status: 'on track',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an unknown phase value', () => {
    const result = SystemElement.safeParse({ ...systemFactory(), phase: 'shipped' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing description', () => {
    const { title } = systemFactory();
    const result = SystemElement.safeParse({ title });
    expect(result.success).toBe(false);
  });
});
