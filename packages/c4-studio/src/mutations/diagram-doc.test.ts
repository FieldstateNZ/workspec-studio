// Unit tests for the diagram Document load/persist pair — including the
// validator-kill probe from the A2 adversarial review: reviewers removed
// `persistDiagramDoc`'s re-validation and the suite stayed green, because
// every public-API path pre-validates its inputs so hard that the gate was
// only ever exercised as defense-in-depth. These tests target the gate
// DIRECTLY: they die if the validation (or its refuse-to-write behaviour)
// is removed.

import { describe, expect, it, vi } from 'vitest';
import { createMemorySource } from '@workspec/c4-model';
import type { C4FileSource } from '@workspec/c4-model';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';

const VALID_DIAGRAM = [
  'title: T',
  'type: c4-context',
  'nodes:',
  '  - slug: a',
  'edges: []',
  '',
].join('\n');

function seededSource(): C4FileSource {
  return createMemorySource({ '.workspec/diagrams/t.yaml': VALID_DIAGRAM });
}

describe('loadDiagramDoc', () => {
  it('loads a valid diagram with an index-aligned doc + data pair', async () => {
    const loaded = await loadDiagramDoc(seededSource(), 't');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.value.slug).toBe('t');
    expect(loaded.value.path).toBe('.workspec/diagrams/t.yaml');
    expect(loaded.value.data.nodes).toEqual([{ slug: 'a' }]);
  });

  it('404s a missing diagram and 400s (with issues) an invalid one', async () => {
    const missing = await loadDiagramDoc(seededSource(), 'ghost');
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('unreachable');
    expect(missing.error.status).toBe(404);

    const broken = createMemorySource({ '.workspec/diagrams/bad.yaml': 'title: only\n' });
    const invalid = await loadDiagramDoc(broken, 'bad');
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('unreachable');
    expect(invalid.error.status).toBe(400);
    expect(invalid.error.issues).toBeDefined();
  });
});

describe('persistDiagramDoc — the never-write-invalid gate', () => {
  it('writes a valid edited doc back through the source', async () => {
    const source = seededSource();
    const loaded = await loadDiagramDoc(source, 't');
    if (!loaded.ok) throw new Error('unreachable');

    const persisted = await persistDiagramDoc(source, loaded.value, [
      { op: 'append-item', seq: 'nodes', value: { slug: 'b' } },
    ]);
    expect(persisted.ok).toBe(true);
    expect(await source.readFile('.workspec/diagrams/t.yaml')).toContain('- slug: b');
  });

  it('REFUSES an edit that produces schema-invalidity: 400 + issues, writeFile NEVER called', async () => {
    const source = seededSource();
    const writeSpy = vi.spyOn(source, 'writeFile');
    const loaded = await loadDiagramDoc(source, 't');
    if (!loaded.ok) throw new Error('unreachable');

    // The kind of damage a buggy (or maliciously mutated) edit path could
    // do: `nodes` must be an array, and `.strict()` forbids stray keys.
    const persisted = await persistDiagramDoc(source, loaded.value, [
      { op: 'set-field', key: 'nodes', value: 'garbage' },
      { op: 'set-field', key: 'stray', value: true },
    ]);
    expect(persisted.ok).toBe(false);
    if (persisted.ok) throw new Error('unreachable');
    expect(persisted.error.status).toBe(400);
    expect(persisted.error.message).toMatch(/invalid/);
    expect(persisted.error.issues).toBeDefined();
    expect(writeSpy).not.toHaveBeenCalled();
    // And the stored text is untouched.
    expect(await source.readFile('.workspec/diagrams/t.yaml')).toBe(VALID_DIAGRAM);
  });
});
