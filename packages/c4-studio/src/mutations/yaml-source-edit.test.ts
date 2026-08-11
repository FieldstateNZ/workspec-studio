// Unit tests for the byte-preserving edit layer (A2 final review, FIX 2).
//
// The contract under test is exactly the one the old `doc.toString()`
// implementation could not keep: an edit changes ONLY the lines it names,
// and every other byte of the file — comments, blank lines, key order,
// hand-wrapped prose, folded block scalars, an absent trailing newline —
// comes through untouched. Each case therefore asserts against the whole
// expected text, not against a substring.

import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { applyYamlSourceEdits } from './yaml-source-edit.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** Applies edits the way every service does: one parse, one batch. */
function edit(source: string, ...edits: YamlSourceEdit[]): string {
  return applyYamlSourceEdits(source, parseDocument(source), edits);
}

const AUTHORED = [
  '# yaml-language-server: $schema=https://example.test/diagram.schema.json',
  'title: A single-line plain scalar deliberately longer than the printer default of eighty columns',
  'description: >',
  '  Every published package plus the two consuming apps, and the real',
  '  workspace dependency edges between them (mined from each package.json).',
  '',
  '# the cast',
  'nodes:',
  '  - slug: alpha',
  '  - external-system: beta',
  '',
  'edges:',
  '  - from: alpha',
  '    to: beta',
  '    label: talks to',
  '',
  '  - from: beta',
  '    to: alpha',
  '',
].join('\n');

describe('the trap this module exists for', () => {
  it('`yaml` cannot round-trip the authored fixture — not at any lineWidth', () => {
    const doc = parseDocument(AUTHORED);
    // Default (80): wraps the long title AND re-folds the `>` scalar.
    expect(doc.toString()).not.toBe(AUTHORED);
    // `lineWidth: 0`: stops the wrapping, collapses the folded scalar instead.
    expect(doc.toString({ lineWidth: 0 })).not.toBe(AUTHORED);
    // …so anything built on re-serialization reflows prose it never touched.
    expect(doc.toString({ lineWidth: 0 })).not.toContain(
      '  Every published package plus the two consuming apps, and the real\n',
    );
  });
});

describe('applyYamlSourceEdits — removals', () => {
  it('removes one sequence item, and only its lines', () => {
    const after = edit(AUTHORED, { op: 'remove-item', seq: 'edges', index: 0 });
    expect(after).toBe(
      AUTHORED.replace('  - from: alpha\n    to: beta\n    label: talks to\n', ''),
    );
  });

  it('removes several items in ONE batch without index drift', () => {
    // Ascending indexes, deliberately: the batch resolves every range against
    // the same parse, so no descending-order dance is needed (and none of the
    // callers does one any more).
    const after = edit(
      AUTHORED,
      { op: 'remove-item', seq: 'nodes', index: 0 },
      { op: 'remove-item', seq: 'edges', index: 0 },
      { op: 'remove-item', seq: 'edges', index: 1 },
    );
    expect(after).toBe(
      AUTHORED.replace('  - slug: alpha\n', '')
        .replace('  - from: alpha\n    to: beta\n    label: talks to\n', '')
        .replace('  - from: beta\n    to: alpha\n', ''),
    );
  });

  it('keeps the blank line an author left AFTER the item it removes', () => {
    // Regression: a node range ends past its own newline, so a naive
    // "extend to the next line boundary" swallowed the following blank line
    // and turned a one-edge delete into a paragraph-break delete too.
    const after = edit(AUTHORED, { op: 'remove-item', seq: 'edges', index: 0 });
    expect(after).toContain('edges:\n\n  - from: beta');
  });

  it('removes a root field as whole lines, leaving neighbours alone', () => {
    const after = edit(AUTHORED, { op: 'remove-field', key: 'description' });
    expect(after).toBe(
      AUTHORED.replace(
        'description: >\n  Every published package plus the two consuming apps, and the real\n  workspace dependency edges between them (mined from each package.json).\n',
        '',
      ),
    );
  });

  it('is a no-op for a field that is not there', () => {
    expect(edit(AUTHORED, { op: 'remove-field', key: 'nope' })).toBe(AUTHORED);
  });
});

describe('applyYamlSourceEdits — writes', () => {
  it('rewrites one root field and nothing else', () => {
    const after = edit(AUTHORED, { op: 'set-field', key: 'title', value: 'Short' });
    expect(after).toBe(AUTHORED.replace(/^title: .*$/m, 'title: Short'));
  });

  it('appends an absent root field at the end of the document', () => {
    expect(edit(AUTHORED, { op: 'set-field', key: 'type', value: 'c4-context' })).toBe(
      `${AUTHORED}type: c4-context\n`,
    );
  });

  it('appends a sequence item under the last existing one, at its indent', () => {
    const after = edit(AUTHORED, {
      op: 'append-item',
      seq: 'nodes',
      value: { container: 'gamma' },
    });
    expect(after).toBe(
      AUTHORED.replace(
        '  - external-system: beta\n',
        '  - external-system: beta\n  - container: gamma\n',
      ),
    );
  });

  it('appends a MULTI-key item with continuation lines aligned under the bullet', () => {
    const after = edit(AUTHORED, {
      op: 'append-item',
      seq: 'edges',
      value: { from: 'beta', to: 'alpha', label: 'notifies' },
    });
    // Appended directly under the last existing edge (first match of this
    // slice IS that edge — the first edge carries a `label:` line).
    expect(after).toBe(
      AUTHORED.replace(
        '  - from: beta\n    to: alpha\n',
        '  - from: beta\n    to: alpha\n  - from: beta\n    to: alpha\n    label: notifies\n',
      ),
    );
  });

  it('sets a field inside a sequence item, adding the line when absent', () => {
    const added = edit(AUTHORED, {
      op: 'set-item-field',
      seq: 'edges',
      index: 1,
      key: 'label',
      value: 'notifies',
    });
    expect(added).toBe(
      AUTHORED.replace(
        '  - from: beta\n    to: alpha\n',
        '  - from: beta\n    to: alpha\n    label: notifies\n',
      ),
    );

    const replaced = edit(AUTHORED, {
      op: 'set-item-field',
      seq: 'edges',
      index: 0,
      key: 'label',
      value: 'curates',
    });
    expect(replaced).toBe(AUTHORED.replace('    label: talks to\n', '    label: curates\n'));
  });

  it('removes a field from a sequence item', () => {
    const after = edit(AUTHORED, {
      op: 'remove-item-field',
      seq: 'edges',
      index: 0,
      key: 'label',
    });
    expect(after).toBe(AUTHORED.replace('    label: talks to\n', ''));
  });

  it('emits new content at lineWidth 0 — a long value is never hand-wrapped', () => {
    const long = 'x'.repeat(40) + ' ' + 'y'.repeat(60);
    const after = edit(AUTHORED, { op: 'set-field', key: 'title', value: long });
    expect(after).toContain(`title: ${long}\n`);
  });
});

describe('applyYamlSourceEdits — shapes that are easy to get wrong', () => {
  it('grows an EMPTY block sequence into canonical block form', () => {
    const source = 'title: T\nnodes:\nedges: []\n';
    expect(edit(source, { op: 'append-item', seq: 'nodes', value: { slug: 'a' } })).toBe(
      'title: T\nnodes:\n  - slug: a\nedges: []\n',
    );
  });

  it('grows an empty FLOW sequence into block form rather than an inline list', () => {
    const source = 'title: T\nedges: []\n# trailing note\n';
    expect(edit(source, { op: 'append-item', seq: 'edges', value: { from: 'a', to: 'b' } })).toBe(
      'title: T\nedges:\n  - from: a\n    to: b\n# trailing note\n',
    );
  });

  it('carries existing FLOW items over instead of dropping them', () => {
    const source = 'nodes: [{ slug: a }]\n';
    expect(edit(source, { op: 'append-item', seq: 'nodes', value: { slug: 'b' } })).toBe(
      'nodes:\n  - slug: a\n  - slug: b\n',
    );
  });

  it('creates the key when the sequence is absent entirely', () => {
    expect(edit('title: T\n', { op: 'append-item', seq: 'nodes', value: { slug: 'a' } })).toBe(
      'title: T\nnodes:\n  - slug: a\n',
    );
  });

  it('leaves a final line unterminated if the author left it unterminated', () => {
    expect(edit('a: 1\nb: 2', { op: 'set-field', key: 'b', value: 3 })).toBe('a: 1\nb: 3');
  });

  it('preserves a trailing `# comment` on a rewritten line', () => {
    expect(
      edit('title: X # keep me\nother: y\n', { op: 'set-field', key: 'title', value: 'Z' }),
    ).toBe('title: Z # keep me\nother: y\n');
  });

  it('inserts before a comment that trails the sequence, not after it', () => {
    const source = 'edges:\n  - from: a\n    to: b\n  # the rest are derived\n';
    expect(edit(source, { op: 'append-item', seq: 'edges', value: { from: 'b', to: 'a' } })).toBe(
      'edges:\n  - from: a\n    to: b\n  - from: b\n    to: a\n  # the rest are derived\n',
    );
  });

  it('throws (a caller bug, not an expected failure) on an index that is not there', () => {
    expect(() => edit(AUTHORED, { op: 'remove-item', seq: 'edges', index: 9 })).toThrow(
      /stale parse/,
    );
  });
});
