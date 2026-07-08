import { describe, expect, it } from 'vitest';
import { classifyThinNode } from './classify-thin-node.js';

describe('classifyThinNode', () => {
  it('classifies a bare slug ref with no position', () => {
    expect(classifyThinNode({ slug: 'architect' })).toEqual({
      slug: 'architect',
      explicitKind: null,
      position: null,
    });
  });

  it('classifies a bare slug ref with a pinned position', () => {
    expect(classifyThinNode({ slug: 'architect', position: { x: 10, y: 20 } })).toEqual({
      slug: 'architect',
      explicitKind: null,
      position: { x: 10, y: 20 },
    });
  });

  it('classifies a typed ref, extracting the one C4_REF_KINDS key present', () => {
    expect(classifyThinNode({ component: 'diagram-editor' })).toEqual({
      slug: 'diagram-editor',
      explicitKind: 'component',
      position: null,
    });
  });

  it('classifies a typed ref with a pinned position', () => {
    expect(classifyThinNode({ domain: 'billing', position: { x: 1, y: 2 } })).toEqual({
      slug: 'billing',
      explicitKind: 'domain',
      position: { x: 1, y: 2 },
    });
  });
});
