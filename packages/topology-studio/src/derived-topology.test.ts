// Unit tests for `derivedDirFor`'s defense-in-depth slug check — the choke
// point every `.topology-actual/<env>/` path funnels through. Every real
// caller (CLI, MCP tools, the HTTP server) pre-validates `env` at its own
// boundary before reaching here (see `derivedDirFor`'s doc comment), so this
// suite exercises the function directly rather than through a caller.

import { describe, expect, it } from 'vitest';
import { derivedDirFor, InvalidEnvSlugError } from './derived-topology.js';

describe('derivedDirFor', () => {
  it('builds the derived directory for a valid slug', () => {
    expect(derivedDirFor('prod')).toBe('.topology-actual/prod');
  });

  it('throws InvalidEnvSlugError for a path-traversal shape', () => {
    expect(() => derivedDirFor('../x')).toThrow(InvalidEnvSlugError);
  });

  it('throws InvalidEnvSlugError for an absolute-path shape', () => {
    expect(() => derivedDirFor('/etc/passwd')).toThrow(InvalidEnvSlugError);
  });
});
