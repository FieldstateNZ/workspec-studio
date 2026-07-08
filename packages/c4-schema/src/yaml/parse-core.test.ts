import { describe, expect, it } from 'vitest';
import { ActorElement } from '../schemas/actor.js';
import { parseYamlArtifact } from './parse-core.js';

describe('parseYamlArtifact', () => {
  it('returns typed data on success', () => {
    const result = parseYamlArtifact(
      'title: Architect\ndescription: Designs systems.\n',
      ActorElement,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Architect');
    }
  });

  it('maps a YAML syntax error to a line/column position', () => {
    const result = parseYamlArtifact('title: Architect\n  description: bad indent\n', ActorElement);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.line).toBeGreaterThan(0);
      expect(result.errors[0]?.col).toBeGreaterThan(0);
    }
  });

  it('maps a Zod validation issue to the source line of the offending key', () => {
    const text = 'title: Architect\ndescription: ""\n';
    const result = parseYamlArtifact(text, ActorElement);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.errors.find((error) => error.path === 'description');
      expect(issue).toBeDefined();
      expect(issue?.line).toBe(2);
    }
  });

  it('reports the dot-joined path for a nested issue', () => {
    const text = [
      'title: Architect',
      'description: Designs systems.',
      'links:',
      '  - adr: bad-path',
    ].join('\n');
    const result = parseYamlArtifact(text, ActorElement);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.path.startsWith('links.0'))).toBe(true);
    }
  });
});
