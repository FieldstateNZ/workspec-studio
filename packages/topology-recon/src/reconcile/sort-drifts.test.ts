import { describe, expect, it } from 'vitest';
import type { Drift } from '../model/drift.types.js';
import { sortDrifts } from './sort-drifts.js';

function phantom(slug: string): Drift {
  return { class: 'phantom', slug, message: slug };
}
function orphan(slug: string): Drift {
  return { class: 'orphan', slug, message: slug };
}
function divergent(authoredSlug: string): Drift {
  return {
    class: 'divergent',
    authoredSlug,
    actualSlug: authoredSlug,
    message: authoredSlug,
    configDiff: [],
    costDiff: [],
  };
}
function miswired(slugs: readonly string[]): Drift {
  return { class: 'miswired', slugs, message: slugs.join(','), edges: [] };
}

describe('sortDrifts', () => {
  it('orders by class (phantom, orphan, divergent, miswired) regardless of input order', () => {
    const input = [miswired(['z']), divergent('y'), orphan('x'), phantom('w')];
    expect(sortDrifts(input).map((d) => d.class)).toEqual([
      'phantom',
      'orphan',
      'divergent',
      'miswired',
    ]);
  });

  it('orders by primary slug ascending within a class', () => {
    const input = [phantom('zeta'), phantom('alpha'), phantom('mu')];
    expect(sortDrifts(input).map((d) => (d as { slug: string }).slug)).toEqual([
      'alpha',
      'mu',
      'zeta',
    ]);
  });

  it('uses the first slug in a miswired cluster as its sort key', () => {
    const input = [miswired(['zeta', 'a']), miswired(['alpha', 'z'])];
    expect(sortDrifts(input).map((d) => (d as { slugs: readonly string[] }).slugs[0])).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});
