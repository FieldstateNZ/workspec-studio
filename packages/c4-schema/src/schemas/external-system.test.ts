import { describe, expect, it } from 'vitest';
import { externalSystemFactory } from '../../test/helpers/factories.js';
import { ExternalSystemElement } from './external-system.js';

describe('ExternalSystemElement', () => {
  it('accepts a minimal external system', () => {
    const result = ExternalSystemElement.safeParse(externalSystemFactory());
    expect(result.success).toBe(true);
  });

  it('accepts the optional type literal', () => {
    const result = ExternalSystemElement.safeParse(externalSystemFactory({ type: 'external-system' }));
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const { description } = externalSystemFactory();
    const result = ExternalSystemElement.safeParse({ description });
    expect(result.success).toBe(false);
  });

  it('has no external: boolean field — externality is the kind itself', () => {
    const result = ExternalSystemElement.safeParse({ ...externalSystemFactory(), external: true });
    expect(result.success).toBe(false);
  });
});
