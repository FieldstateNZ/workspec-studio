import { describe, expect, it } from 'vitest';
import { domainFactory } from '../../test/helpers/factories.js';
import { DomainElement } from './domain.js';

describe('DomainElement', () => {
  it('accepts a minimal domain', () => {
    const result = DomainElement.safeParse(domainFactory());
    expect(result.success).toBe(true);
  });

  it('rejects a type field — domains never carry a kind literal', () => {
    const result = DomainElement.safeParse({ ...domainFactory(), type: 'domain' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing description', () => {
    const { title } = domainFactory();
    const result = DomainElement.safeParse({ title });
    expect(result.success).toBe(false);
  });
});
