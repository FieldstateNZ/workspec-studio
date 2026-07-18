import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ActorArtifact } from '../../src/schemas/actor.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function loadFixture(relativePath: string): unknown {
  return parse(readFileSync(join(fixturesDir, relativePath), 'utf8'));
}

describe('Actor fixtures', () => {
  it('accepts the valid fixture', () => {
    const result = ActorArtifact.safeParse(loadFixture('valid/dev-lead.yaml'));
    expect(result.success).toBe(true);
  });

  it('rejects the wrong-kind fixture', () => {
    const result = ActorArtifact.safeParse(loadFixture('invalid/wrong-kind.yaml'));
    expect(result.success).toBe(false);
  });

  it('rejects the missing-name fixture', () => {
    const result = ActorArtifact.safeParse(loadFixture('invalid/missing-name.yaml'));
    expect(result.success).toBe(false);
  });
});
