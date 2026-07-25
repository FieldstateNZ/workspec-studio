import { describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/topology-model';
import { createInertLinkResolver, sourceId } from './host.js';

describe('createInertLinkResolver', () => {
  it('resolves every link as unresolved', () => {
    const resolver = createInertLinkResolver();
    expect(resolver({ kind: 'c4-container', label: 'api', target: 'api' })).toEqual({
      resolved: false,
    });
  });
});

describe('sourceId', () => {
  it('assigns a stable id to the same source instance', () => {
    const source = createMemorySource({});
    expect(sourceId(source)).toBe(sourceId(source));
  });

  it('assigns distinct ids to distinct source instances', () => {
    const a = createMemorySource({});
    const b = createMemorySource({});
    expect(sourceId(a)).not.toBe(sourceId(b));
  });
});
