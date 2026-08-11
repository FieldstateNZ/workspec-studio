import { describe, expect, it } from 'vitest';
import { ELEMENT_KINDS } from '@workspec/c4-model';
import { schemaDirective, schemaUrlFor } from '@workspec/c4-schema';
import { ELEMENT_YAML_PARSERS } from './element-parsers.js';
import { serializeNewElement } from './serialize-new-element.js';
import { TECHNOLOGY_KINDS } from './technology-kinds.js';

describe('serializeNewElement', () => {
  it('emits a directive-headed, schema-valid file for every element kind', () => {
    for (const kind of ELEMENT_KINDS) {
      const text = serializeNewElement(kind, { title: 'Thing', description: 'A thing.' });
      // Line one is the kind's OWN directive (editor completion binding).
      expect(text.startsWith(schemaDirective(schemaUrlFor(kind))), kind).toBe(true);
      const parsed = ELEMENT_YAML_PARSERS[kind](text);
      expect(parsed.ok, `${kind}: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it('records the type literal exactly for the four shared-schema kinds', () => {
    for (const kind of ELEMENT_KINDS) {
      const text = serializeNewElement(kind, { title: 'T', description: 'D' });
      if (TECHNOLOGY_KINDS.has(kind)) {
        expect(text, kind).toContain(`type: ${kind}`);
      } else {
        expect(text, kind).not.toMatch(/^type:/m);
      }
    }
  });

  it('omits empty optional fields and quotes special characters safely', () => {
    const bare = serializeNewElement('container', { title: 'T', description: 'D' });
    expect(bare).not.toContain('technology');
    expect(bare).not.toContain('tags');

    const tricky = serializeNewElement('actor', {
      title: 'Ops: on-call #1',
      description: 'Line one\nLine two',
      tags: ['a b', 'c: d'],
    });
    const parsed = ELEMENT_YAML_PARSERS.actor(tricky);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data).toMatchObject({
      title: 'Ops: on-call #1',
      description: 'Line one\nLine two',
      tags: ['a b', 'c: d'],
    });
  });

  it('is deterministic: identical input, identical bytes', () => {
    const a = serializeNewElement('queue', { title: 'Bus', description: 'D', technology: 'NATS' });
    const b = serializeNewElement('queue', { title: 'Bus', description: 'D', technology: 'NATS' });
    expect(a).toBe(b);
  });
});
