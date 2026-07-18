import { describe, expect, it } from 'vitest';
import { API_VERSION } from '../constants.js';
import { ActorArtifact, ActorSpec } from './actor.js';

function actorFactory(overrides: Partial<ActorSpec> = {}): ActorSpec {
  return {
    name: 'Dev lead',
    description: 'Runs a build, delegates slices, owns signoff.',
    ...overrides,
  };
}

describe('ActorSpec', () => {
  it('accepts a minimal actor (name only)', () => {
    const result = ActorSpec.safeParse({ name: 'Dev lead' });
    expect(result.success).toBe(true);
  });

  it('accepts name, description, tags, and links', () => {
    const result = ActorSpec.safeParse(
      actorFactory({
        tags: ['human'],
        links: [{ adr: '~/docs/decisions/staffing.md' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = ActorSpec.safeParse({ description: 'Missing a name.' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = ActorSpec.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty description when present', () => {
    const result = ActorSpec.safeParse({ name: 'Dev lead', description: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a links entry whose path does not start with ~/ or @workspace/', () => {
    const result = ActorSpec.safeParse(actorFactory({ links: [{ adr: 'docs/README.md' }] }));
    expect(result.success).toBe(false);
  });
});

describe('ActorArtifact', () => {
  it('validates a full envelope matching docs/traceability/spec.md §4.1', () => {
    const result = ActorArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Actor',
      metadata: { slug: 'dev-lead' },
      spec: actorFactory(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = ActorArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'NotAnActor',
      metadata: { slug: 'dev-lead' },
      spec: actorFactory(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a spec missing name', () => {
    const result = ActorArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Actor',
      metadata: { slug: 'dev-lead' },
      spec: { description: 'Missing a name.' },
    });
    expect(result.success).toBe(false);
  });
});
