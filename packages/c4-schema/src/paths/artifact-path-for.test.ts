import { describe, expect, it } from 'vitest';
import { artifactPathFor } from './artifact-path-for.js';

describe('artifactPathFor', () => {
  it('builds an actor path', () => {
    expect(artifactPathFor('actor', 'architect')).toBe('.workspec/actors/architect.yaml');
  });

  it('builds the singleton system path', () => {
    expect(artifactPathFor('system', 'main-system')).toBe('.workspec/system/main-system.yaml');
  });

  it('builds an external-system path', () => {
    expect(artifactPathFor('external-system', 'payment-gateway')).toBe(
      '.workspec/external-systems/payment-gateway.yaml',
    );
  });

  it('builds a diagram path', () => {
    expect(artifactPathFor('diagram', 'system-context')).toBe('.workspec/diagrams/system-context.yaml');
  });

  it('never emits a .yml extension', () => {
    expect(artifactPathFor('container', 'api-server').endsWith('.yaml')).toBe(true);
  });
});
