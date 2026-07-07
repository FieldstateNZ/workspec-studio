import { describe, expect, it } from 'vitest';
import { actorFactory } from '../../test/helpers/factories.js';
import { ActorElement } from './actor.js';

describe('ActorElement', () => {
  it('accepts a minimal actor', () => {
    const result = ActorElement.safeParse(actorFactory());
    expect(result.success).toBe(true);
  });

  it('accepts the optional type literal, tags, links, and source', () => {
    const result = ActorElement.safeParse(
      actorFactory({
        type: 'actor',
        tags: ['human'],
        links: [{ adr: '~/docs/architecture/README.md' }],
        source: 'imported from org chart',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing description', () => {
    const { title } = actorFactory();
    const result = ActorElement.safeParse({ title });
    expect(result.success).toBe(false);
  });

  it('accepts an empty title (Enterprise parity: title is a plain string; only description is min-1)', () => {
    const result = ActorElement.safeParse(actorFactory({ title: '' }));
    expect(result.success).toBe(true);
  });

  it('rejects an empty description', () => {
    const result = ActorElement.safeParse(actorFactory({ description: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a links entry whose path does not start with ~/ or @workspace/', () => {
    const result = ActorElement.safeParse(actorFactory({ links: [{ adr: 'docs/README.md' }] }));
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field (no external: boolean in this schema family)', () => {
    const result = ActorElement.safeParse({ ...actorFactory(), external: true });
    expect(result.success).toBe(false);
  });
});
