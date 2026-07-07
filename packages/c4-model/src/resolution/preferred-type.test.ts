import { describe, expect, it } from 'vitest';
import { preferredOrderFor, rankOf } from './preferred-type.js';

describe('preferredOrderFor', () => {
  it('returns the Enterprise-mirrored order for c4-context', () => {
    expect(preferredOrderFor('c4-context', null)).toEqual(['system', 'actor', 'external-system']);
  });

  it('returns the Enterprise-mirrored order for c4-component', () => {
    expect(preferredOrderFor('c4-component', null)).toEqual(['feature', 'component']);
  });

  it('lens-partitions c4-container: logical prefers domain, deployment prefers container', () => {
    expect(preferredOrderFor('c4-container', 'logical')).toEqual(['domain', 'container', 'database', 'queue']);
    expect(preferredOrderFor('c4-container', 'deployment')).toEqual(['container', 'domain', 'database', 'queue']);
  });

  it('defaults c4-container with no lens given to the logical order', () => {
    expect(preferredOrderFor('c4-container', null)).toEqual(['domain', 'container', 'database', 'queue']);
  });

  it('returns an empty order for any other diagram type', () => {
    expect(preferredOrderFor('sequence', null)).toEqual([]);
    expect(preferredOrderFor('custom', null)).toEqual([]);
  });
});

describe('rankOf', () => {
  it('ranks a preferred kind by its position in the list', () => {
    expect(rankOf('feature', ['feature', 'component'])).toBe(0);
    expect(rankOf('component', ['feature', 'component'])).toBe(1);
  });

  it('ranks any kind outside the preferred list after every preferred kind, by C4_REF_KINDS order', () => {
    const domainRank = rankOf('domain', []);
    const actorRank = rankOf('actor', []);
    // C4_REF_KINDS order: actor, system, external-system, container, component, database, queue, domain, ...
    expect(actorRank).toBeLessThan(domainRank);
  });

  it('a preferred kind always outranks a non-preferred one', () => {
    const preferred = ['feature', 'component'] as const;
    expect(rankOf('feature', preferred)).toBeLessThan(rankOf('actor', preferred));
  });
});
