import { describe, expect, it } from 'vitest';
import { relationEndpointMatches } from './relation-endpoint-matches.js';

// The single substitution the relation routes must tolerate: a diagram
// writes `__system__`, the resolver hands the canvas the system's real slug,
// and every canvas gesture on that edge then addresses it by the slug.

describe('relationEndpointMatches', () => {
  it('matches identical endpoints, with or without a system', () => {
    expect(relationEndpointMatches('architect', 'architect', 'main-system')).toBe(true);
    expect(relationEndpointMatches('architect', 'architect', null)).toBe(true);
  });

  it('matches an authored alias against the resolved system slug — and back', () => {
    expect(relationEndpointMatches('__system__', 'main-system', 'main-system')).toBe(true);
    expect(relationEndpointMatches('main-system', '__system__', 'main-system')).toBe(true);
  });

  it('never matches a different element, and never guesses without a system', () => {
    expect(relationEndpointMatches('architect', 'main-system', 'main-system')).toBe(false);
    expect(relationEndpointMatches('__system__', 'other-system', 'main-system')).toBe(false);
    // No system in the tree: the alias stands for nothing, so only the exact
    // token matches (the diagram's `no-system` diagnostic explains the rest).
    expect(relationEndpointMatches('__system__', 'main-system', null)).toBe(false);
    expect(relationEndpointMatches('__system__', '__system__', null)).toBe(true);
  });
});
