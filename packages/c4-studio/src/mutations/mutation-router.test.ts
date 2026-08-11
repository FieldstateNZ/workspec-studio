// Round-trip tests for the element/relation write API (issue #132), driven
// through the real Express app over a real temp-dir copy of the
// representative tree — the same harness as `server.test.ts`. Byte-stability
// is asserted with a line-multiset diff: a mutation may only add/remove the
// exact lines it is about, and everything else (directive comments, key
// order, formatting) must survive byte-for-byte.

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Test as SupertestTest } from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  CONTAINER_SCHEMA_DIRECTIVE,
  parseContainerYaml,
  parseDiagramYaml,
  parseDomainYaml,
  parseLayoutYaml,
} from '@workspec/c4-schema';
import { createServer } from '../server.js';
import { PLACEHOLDER_DESCRIPTION } from './create-element.js';
import { createMutationQueue } from './mutation-queue.js';
import type { MutationQueue } from './mutation-queue.js';

const REPRESENTATIVE_DIR = fileURLToPath(
  new URL('../../../c4-schema/test/fixtures/representative', import.meta.url),
);

const CONTAINER_DIAGRAM = '.workspec/diagrams/container.yaml';
const CONTEXT_DIAGRAM = '.workspec/diagrams/system-context.yaml';
const CONTEXT_LAYOUT = '.workspec/diagrams/.layout/system-context.yaml';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-mut-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function app(): ReturnType<typeof createServer> {
  return createServer({ dir });
}

async function read(path: string): Promise<string> {
  return readFile(join(dir, path), 'utf8');
}

/**
 * Line-multiset diff between two file texts: what a `git diff` would show
 * as added/removed lines, ignoring position. The byte-stability probes
 * assert these sets exactly.
 */
function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const count = (text: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const line of text.split('\n')) m.set(line, (m.get(line) ?? 0) + 1);
    return m;
  };
  const b = count(before);
  const a = count(after);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [line, n] of a) for (let i = 0; i < n - (b.get(line) ?? 0); i++) added.push(line);
  for (const [line, n] of b) for (let i = 0; i < n - (a.get(line) ?? 0); i++) removed.push(line);
  return { added, removed };
}

/**
 * POSITIONAL byte-stability assertion — the one `lineDiff` cannot make.
 * `lineDiff` compares line MULTISETS, so it is blind to a line that stayed
 * present but moved, and (the case that actually bit) to prose that was
 * re-wrapped: the reflowed pair shows up as one added + one removed line
 * only if the fixture happens to contain such a line at all. This asserts
 * the strong property directly: `after` is `before` with exactly
 * `removed` deleted and every surviving line byte-identical IN PLACE.
 *
 * Lines in `removed` must be unique within `before` (the fixtures here are
 * written that way) — the first match is the one struck out.
 */
function expectLinesRemovedInPlace(
  before: string,
  after: string,
  removed: readonly string[],
): void {
  const remaining = before.split('\n');
  for (const line of removed) {
    const at = remaining.indexOf(line);
    expect(at, `expected ${JSON.stringify(line)} in the "before" text`).toBeGreaterThanOrEqual(0);
    remaining.splice(at, 1);
  }
  expect(after.split('\n')).toEqual(remaining);
}

/** Every file path under the served dir, relative, sorted — for confinement sweeps. */
async function allFiles(): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

/**
 * Full path→content snapshot of the served dir. Hostile-request tests
 * assert snapshot equality before/after: a rejected request must have NO
 * filesystem side effect — no file created, none modified.
 */
async function treeState(): Promise<Map<string, string>> {
  const state = new Map<string, string>();
  for (const file of await allFiles()) state.set(file, await read(file));
  return state;
}

function getModel(): SupertestTest {
  return request(app()).get('/api/model');
}

describe('POST /api/elements — create', () => {
  it('creates a schema-valid container file the model loader round-trips', async () => {
    const res = await request(app())
      .post('/api/elements')
      .send({
        kind: 'container',
        name: 'Checkout Service',
        technology: 'Node.js',
        tags: ['backend'],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'container',
      slug: 'checkout-service',
      path: '.workspec/containers/checkout-service.yaml',
      title: 'Checkout Service',
      diagramTouched: false,
    });

    const text = await read('.workspec/containers/checkout-service.yaml');
    // Directive header first (editor completion from the moment it exists).
    expect(text.startsWith(CONTAINER_SCHEMA_DIRECTIVE)).toBe(true);
    const parsed = parseContainerYaml(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data).toEqual({
      type: 'container',
      title: 'Checkout Service',
      description: PLACEHOLDER_DESCRIPTION,
      technology: 'Node.js',
      tags: ['backend'],
    });

    // Round trip: a fresh model load sees the element.
    const model = await getModel();
    expect(model.body.elements.container['checkout-service']).toMatchObject({
      slug: 'checkout-service',
    });
  });

  it('drops the new element onto a diagram with a typed ref and a layout pin', async () => {
    const before = await read(CONTAINER_DIAGRAM);
    const res = await request(app())
      .post('/api/elements')
      .send({
        kind: 'container',
        name: 'Audit Log',
        diagram: 'container',
        position: { x: 10, y: 20 },
      });
    expect(res.status).toBe(201);
    expect(res.body.diagramTouched).toBe(true);

    // Byte-stability: EXACTLY one added line, nothing else moved.
    const after = await read(CONTAINER_DIAGRAM);
    const diff = lineDiff(before, after);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(['  - container: audit-log']);

    // Position pin landed in the (freshly created) layout file.
    const layout = parseLayoutYaml(await read('.workspec/diagrams/.layout/container.yaml'));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes['audit-log']).toEqual({ x: 10, y: 20 });

    // Round trip: the diagram's raw nodes now include the ref.
    const model = await getModel();
    const diagram = (model.body.diagrams as { slug: string; raw: { nodes: unknown[] } }[]).find(
      (d) => d.slug === 'container',
    );
    expect(diagram?.raw.nodes).toContainEqual({ container: 'audit-log' });
  });

  it('409s a duplicate slug and leaves the existing file untouched', async () => {
    const before = await read('.workspec/containers/api-server.yaml');
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'container', name: 'API Server' });
    expect(res.status).toBe(409);
    expect(await read('.workspec/containers/api-server.yaml')).toBe(before);
  });

  it('404s an unknown diagram BEFORE writing the element file', async () => {
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'actor', name: 'Ghost', diagram: 'no-such-diagram' });
    expect(res.status).toBe(404);
    const actors = await readdir(join(dir, '.workspec/actors'));
    expect(actors).not.toContain('ghost.yaml');
  });

  it('rejects a name that slugifies to nothing', async () => {
    const res = await request(app()).post('/api/elements').send({ kind: 'actor', name: '###' });
    expect(res.status).toBe(400);
  });

  it('rejects technology on a kind whose schema has no such field', async () => {
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'actor', name: 'Ops', technology: 'human' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/technology/);
  });

  it('zod-gates the body: bad kind, diagram-as-kind, and unknown keys are 400 with ZERO fs side effects', async () => {
    const before = await treeState();
    for (const body of [
      { kind: '../..', name: 'X' },
      { kind: 'diagram', name: 'X' },
      { kind: 'actor', name: 'X', extra: true },
      { kind: 'actor' },
    ]) {
      const res = await request(app()).post('/api/elements').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('invalid request');
    }
    // Rejected requests created and modified NOTHING.
    expect(await treeState()).toEqual(before);
  });

  it('confines every write to .workspec/ even for hostile-looking names', async () => {
    const before = await allFiles();
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'actor', name: '  ../../Evil Name  ' });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('evil-name');
    const created = (await allFiles()).filter((f) => !before.includes(f));
    expect(created).toEqual(['.workspec/actors/evil-name.yaml']);
  });

  it('appends a FAT node (id/type/label) when the target diagram is fat-shaped', async () => {
    await writeFile(
      join(dir, '.workspec/diagrams/legacy.yaml'),
      [
        'title: Legacy',
        'type: c4-container',
        'nodes:',
        '  - id: api-server',
        '    type: container',
        '    label: API Server',
        'edges: []',
        '',
      ].join('\n'),
    );
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'database', name: 'Cache', description: 'Hot cache.', diagram: 'legacy' });
    expect(res.status).toBe(201);
    expect(res.body.diagramTouched).toBe(true);

    const parsed = parseDiagramYaml(await read('.workspec/diagrams/legacy.yaml'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.nodes).toContainEqual({ id: 'cache', type: 'database', label: 'Cache' });
    // A supplied description is used verbatim (no placeholder).
    const element = await read('.workspec/databases/cache.yaml');
    expect(element).toContain('description: Hot cache.');
  });
});

describe('PATCH /api/elements — update and rename (slug-stable)', () => {
  it('renames by rewriting ONLY the title line; slug, refs, and comments survive', async () => {
    const before = await read('.workspec/actors/architect.yaml');
    const res = await request(app())
      .patch('/api/elements')
      .send({ slug: 'architect', name: 'Chief Architect' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'actor',
      slug: 'architect',
      path: '.workspec/actors/architect.yaml',
    });

    const after = await read('.workspec/actors/architect.yaml');
    const diff = lineDiff(before, after);
    expect(diff.removed).toEqual(['title: Architect']);
    expect(diff.added).toEqual(['title: Chief Architect']);

    // Slug stability: the file did not move and diagram refs still resolve.
    const model = await getModel();
    expect(model.body.elements.actor.architect.element.data.title).toBe('Chief Architect');
    expect(await read(CONTEXT_DIAGRAM)).toContain('slug: architect');
    // No new diagnostics: nothing dangles after a rename.
    expect(model.body.diagnostics).toHaveLength(1);
  });

  it('updates description/technology/tags in place', async () => {
    const res = await request(app())
      .patch('/api/elements')
      .send({
        slug: 'api-server',
        description: 'Serves the API.',
        technology: 'Bun',
        tags: ['backend', 'edge'],
      });
    expect(res.status).toBe(200);
    const parsed = parseContainerYaml(await read('.workspec/containers/api-server.yaml'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data).toMatchObject({
      title: 'API Server',
      description: 'Serves the API.',
      technology: 'Bun',
      tags: ['backend', 'edge'],
    });
  });

  it('empty technology and empty tags DELETE their keys', async () => {
    const res = await request(app())
      .patch('/api/elements')
      .send({ slug: 'api-server', technology: '', tags: [] });
    expect(res.status).toBe(200);
    const text = await read('.workspec/containers/api-server.yaml');
    expect(text).not.toContain('technology:');
    expect(text).not.toContain('tags:');
    expect(parseContainerYaml(text).ok).toBe(true);
  });

  it('refuses an update that would make the file schema-invalid, leaving it untouched', async () => {
    const before = await read('.workspec/containers/api-server.yaml');
    const res = await request(app())
      .patch('/api/elements')
      .send({ slug: 'api-server', description: '' });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
    expect(await read('.workspec/containers/api-server.yaml')).toBe(before);
  });

  it('404s an unknown slug, 400s technology on an actor, 400s an empty patch', async () => {
    expect(
      (await request(app()).patch('/api/elements').send({ slug: 'nobody', name: 'X' })).status,
    ).toBe(404);
    expect(
      (await request(app()).patch('/api/elements').send({ slug: 'architect', technology: 'human' }))
        .status,
    ).toBe(400);
    expect((await request(app()).patch('/api/elements').send({ slug: 'architect' })).status).toBe(
      400,
    );
  });

  it('400s an update to a file with YAML syntax errors instead of clobbering it', async () => {
    const broken = 'title: [unclosed\ndescription: x\n';
    await writeFile(join(dir, '.workspec/actors/broken.yaml'), broken);
    const res = await request(app())
      .patch('/api/elements')
      .send({ slug: 'broken', name: 'Fixed?' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YAML syntax/);
    expect(await read('.workspec/actors/broken.yaml')).toBe(broken);
  });

  it('409s an ambiguous slug until kind disambiguates', async () => {
    // The fixture has domain "billing"; add an actor with the same slug.
    await request(app()).post('/api/elements').send({ kind: 'actor', name: 'Billing' });
    const ambiguous = await request(app())
      .patch('/api/elements')
      .send({ slug: 'billing', name: 'Billing Dept' });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error).toMatch(/ambiguous/);

    const disambiguated = await request(app())
      .patch('/api/elements')
      .send({ slug: 'billing', kind: 'domain', name: 'Billing Domain' });
    expect(disambiguated.status).toBe(200);
    const domain = parseDomainYaml(await read('.workspec/domains/billing.yaml'));
    expect(domain.ok).toBe(true);
    if (!domain.ok) throw new Error('unreachable');
    expect(domain.data.title).toBe('Billing Domain');
  });
});

describe('DELETE /api/elements — delete with dangling-reference scrub', () => {
  it('removes the file, its diagram node, and every edge touching it', async () => {
    const res = await request(app()).delete('/api/elements').send({ slug: 'api-server' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'container',
      slug: 'api-server',
      removedPath: '.workspec/containers/api-server.yaml',
      scrubbedDiagrams: ['container'],
    });

    const files = await readdir(join(dir, '.workspec/containers')).catch(() => []);
    expect(files).not.toContain('api-server.yaml');

    const diagramText = await read(CONTAINER_DIAGRAM);
    expect(diagramText).not.toContain('api-server');
    const parsed = parseDiagramYaml(diagramText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    // The two api-server edges are gone; the unrelated billing edge stays.
    expect(parsed.data.edges).toEqual([
      {
        from: 'billing',
        to: 'event-bus',
        label: 'publishes events',
        category: 'interaction',
        lens: 'logical',
      },
    ]);

    // Round trip: the model reloads with no NEW diagnostics (nothing dangles).
    const model = await getModel();
    expect(model.body.elements.container['api-server']).toBeUndefined();
    expect(model.body.diagnostics).toHaveLength(1);
  });

  it('scrubs .layout/ node pins and edge hints for the deleted element', async () => {
    const res = await request(app()).delete('/api/elements').send({ slug: 'architect' });
    expect(res.status).toBe(200);
    expect(res.body.scrubbedDiagrams).toEqual(['system-context']);

    const layout = parseLayoutYaml(await read(CONTEXT_LAYOUT));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes['architect']).toBeUndefined();
    expect(layout.data.nodes['__system__']).toEqual({ x: 400, y: 200 });
    expect(layout.data.edges?.['architect->__system__']).toBeUndefined();

    const diagram = parseDiagramYaml(await read(CONTEXT_DIAGRAM));
    expect(diagram.ok).toBe(true);
    if (!diagram.ok) throw new Error('unreachable');
    expect(diagram.data.nodes).toEqual([{ 'external-system': 'payment-gateway' }]);
    expect(diagram.data.edges).toEqual([
      {
        from: '__system__',
        to: 'payment-gateway',
        label: 'settles invoices via',
        category: 'data',
      },
    ]);

    // The reload is CLEANER than baseline: the fixture's one warning was
    // architect's dangling ~/ link, and architect is gone.
    const model = await getModel();
    expect(model.body.diagnostics).toHaveLength(0);
  });

  it('keeps bare refs and edges when another kind still bears the slug', async () => {
    await request(app()).post('/api/elements').send({ kind: 'actor', name: 'Billing' });
    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'actor' });
    expect(res.status).toBe(200);
    // The domain "billing" survives, so its typed ref and edges are untouched.
    expect(res.body.scrubbedDiagrams).toEqual([]);
    const diagram = await read(CONTAINER_DIAGRAM);
    expect(diagram).toContain('- domain: billing');
    expect(diagram).toContain('from: billing');
  });

  it('scrubs typed refs and edges once the LAST bearer of the slug goes', async () => {
    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'domain' });
    expect(res.status).toBe(200);
    expect(res.body.scrubbedDiagrams).toEqual(['container']);
    const diagram = await read(CONTAINER_DIAGRAM);
    expect(diagram).not.toContain('billing');
  });

  it('404s an unknown slug and 409s an ambiguous one', async () => {
    expect((await request(app()).delete('/api/elements').send({ slug: 'nobody' })).status).toBe(
      404,
    );
    await request(app()).post('/api/elements').send({ kind: 'actor', name: 'Billing' });
    expect((await request(app()).delete('/api/elements').send({ slug: 'billing' })).status).toBe(
      409,
    );
  });
});

describe('POST /api/relations — create', () => {
  it('appends exactly the edge lines and nothing else', async () => {
    const before = await read(CONTEXT_DIAGRAM);
    const res = await request(app()).post('/api/relations').send({
      diagram: 'system-context',
      from: 'architect',
      to: 'payment-gateway',
      label: 'reviews settlements in',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      diagram: 'system-context',
      from: 'architect',
      to: 'payment-gateway',
    });

    const after = await read(CONTEXT_DIAGRAM);
    const diff = lineDiff(before, after);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([
      '  - from: architect',
      '    to: payment-gateway',
      '    label: reviews settlements in',
    ]);

    const model = await getModel();
    const diagram = (model.body.diagrams as { slug: string; raw: { edges: unknown[] } }[]).find(
      (d) => d.slug === 'system-context',
    );
    expect(diagram?.raw.edges).toContainEqual({
      from: 'architect',
      to: 'payment-gateway',
      label: 'reviews settlements in',
    });
  });

  it('accepts the __system__ alias as an endpoint, with lens and category', async () => {
    const res = await request(app()).post('/api/relations').send({
      diagram: 'container',
      from: 'billing',
      to: '__system__',
      lens: 'logical',
      category: 'interaction',
    });
    expect(res.status).toBe(201);
    const parsed = parseDiagramYaml(await read(CONTAINER_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.edges).toContainEqual({
      from: 'billing',
      to: '__system__',
      lens: 'logical',
      category: 'interaction',
    });
  });

  it('400s an endpoint that is not a node of the diagram', async () => {
    // api-server exists as an ELEMENT but is not on the system-context diagram.
    const res = await request(app())
      .post('/api/relations')
      .send({ diagram: 'system-context', from: 'api-server', to: 'architect' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a node/);
  });

  it('409s a duplicate (from, to) pair and 404s an unknown diagram', async () => {
    expect(
      (
        await request(app())
          .post('/api/relations')
          .send({ diagram: 'system-context', from: 'architect', to: '__system__' })
      ).status,
    ).toBe(409);
    expect(
      (await request(app()).post('/api/relations').send({ diagram: 'ghost', from: 'a', to: 'b' }))
        .status,
    ).toBe(404);
  });

  it('zod-gates traversal-shaped slugs on every field, with ZERO fs side effects', async () => {
    const before = await treeState();
    for (const body of [
      { diagram: '../etc', from: 'architect', to: '__system__' },
      { diagram: 'system-context', from: '../x', to: '__system__' },
      { diagram: 'system-context', from: 'architect', to: 'UPPER' },
    ]) {
      const res = await request(app()).post('/api/relations').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('invalid request');
    }
    expect(await treeState()).toEqual(before);
  });
});

describe('PATCH /api/relations — rename', () => {
  it('rewrites only the label line', async () => {
    const before = await read(CONTEXT_DIAGRAM);
    const res = await request(app()).patch('/api/relations').send({
      diagram: 'system-context',
      from: 'architect',
      to: '__system__',
      label: 'architects',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagram: 'system-context', updated: 1 });
    const diff = lineDiff(before, await read(CONTEXT_DIAGRAM));
    expect(diff.removed).toEqual(['    label: designs systems in']);
    expect(diff.added).toEqual(['    label: architects']);
  });

  it('an empty label deletes the label key', async () => {
    const res = await request(app())
      .patch('/api/relations')
      .send({ diagram: 'system-context', from: 'architect', to: '__system__', label: '' });
    expect(res.status).toBe(200);
    const parsed = parseDiagramYaml(await read(CONTEXT_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.edges[0]).toEqual({
      from: 'architect',
      to: '__system__',
      category: 'identity',
    });
  });

  it('404s a pair with no edge', async () => {
    const res = await request(app())
      .patch('/api/relations')
      .send({ diagram: 'system-context', from: 'payment-gateway', to: 'architect', label: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/relations — delete with layout-hint scrub', () => {
  it('removes the edge lines and the .layout/ routing hint, keeping node pins', async () => {
    const before = await read(CONTEXT_DIAGRAM);
    const res = await request(app())
      .delete('/api/relations')
      .send({ diagram: 'system-context', from: 'architect', to: '__system__' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagram: 'system-context', removed: 1 });

    const diff = lineDiff(before, await read(CONTEXT_DIAGRAM));
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([
      '  - from: architect',
      '    to: __system__',
      '    label: designs systems in',
      '    category: identity',
    ]);

    const layout = parseLayoutYaml(await read(CONTEXT_LAYOUT));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.edges?.['architect->__system__']).toBeUndefined();
    // Node pins survive an edge delete — the nodes are still on the diagram.
    expect(layout.data.nodes['architect']).toEqual({ x: 80, y: 200, width: 240, height: 120 });

    // Round trip: reload is clean (same single baseline warning).
    const model = await getModel();
    expect(model.body.diagnostics).toHaveLength(1);
  });

  it('404s a pair with no edge', async () => {
    const res = await request(app())
      .delete('/api/relations')
      .send({ diagram: 'system-context', from: '__system__', to: 'architect' });
    expect(res.status).toBe(404);
  });
});

describe('write serialization — concurrent mutations on one diagram (A2 review FIX 1)', () => {
  it('two parallel relation-deletes both land (no lost update)', async () => {
    // ONE app instance = one queue; the fixture container diagram has three
    // edges. Without serialization both handlers read the same "before"
    // text and the second write resurrects the first victim (reproduced
    // live in review: both 200, one edit vanished).
    const shared = app();
    const [a, b] = await Promise.all([
      request(shared)
        .delete('/api/relations')
        .send({ diagram: 'container', from: 'api-server', to: 'primary-db' }),
      request(shared)
        .delete('/api/relations')
        .send({ diagram: 'container', from: 'billing', to: 'event-bus' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const parsed = parseDiagramYaml(await read(CONTAINER_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.edges).toEqual([
      { from: 'api-server', to: 'event-bus', label: 'publishes/consumes', lens: 'both' },
    ]);
  });

  it('two parallel relation-creates both land', async () => {
    const shared = app();
    const [a, b] = await Promise.all([
      request(shared)
        .post('/api/relations')
        .send({ diagram: 'system-context', from: 'architect', to: 'payment-gateway' }),
      request(shared)
        .post('/api/relations')
        .send({ diagram: 'system-context', from: 'payment-gateway', to: 'architect' }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const parsed = parseDiagramYaml(await read(CONTEXT_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.edges).toHaveLength(4); // 2 fixture + both new edges
  });
});

describe('DELETE /api/diagram-nodes — the diagram-scoped canvas gesture (A2 review FIX 2)', () => {
  it('removes the node ref + touching edges from ONE diagram; the element file SURVIVES', async () => {
    const res = await request(app())
      .delete('/api/diagram-nodes')
      .send({ diagram: 'container', node: 'api-server' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      diagram: 'container',
      node: 'api-server',
      removedNodes: 1,
      removedEdges: 2,
    });

    // Diagram-scoped: the ref and its two edges are gone from THIS diagram…
    const diagramText = await read(CONTAINER_DIAGRAM);
    expect(diagramText).not.toContain('api-server');
    const parsed = parseDiagramYaml(diagramText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.edges).toEqual([
      {
        from: 'billing',
        to: 'event-bus',
        label: 'publishes events',
        category: 'interaction',
        lens: 'logical',
      },
    ]);

    // …but the element file is untouched (that is deleteElement's job).
    const element = await read('.workspec/containers/api-server.yaml');
    expect(parseContainerYaml(element).ok).toBe(true);

    // Round trip: the model still loads the element; no new diagnostics.
    const model = await getModel();
    expect(model.body.elements.container['api-server']).toBeDefined();
    expect(model.body.diagnostics).toHaveLength(1);
  });

  it('scrubs the diagram layout pin and touching edge hints', async () => {
    const res = await request(app())
      .delete('/api/diagram-nodes')
      .send({ diagram: 'system-context', node: 'architect' });
    expect(res.status).toBe(200);

    const layout = parseLayoutYaml(await read(CONTEXT_LAYOUT));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes['architect']).toBeUndefined();
    expect(layout.data.nodes['__system__']).toEqual({ x: 400, y: 200 });
    expect(layout.data.edges?.['architect->__system__']).toBeUndefined();

    // The actor FILE survives (with its known dangling-link warning).
    const model = await getModel();
    expect(model.body.elements.actor['architect']).toBeDefined();
    expect(model.body.diagnostics).toHaveLength(1);
  });

  it('404s an unknown node or diagram; zod-gates hostile slugs with no side effects', async () => {
    const before = await treeState();
    expect(
      (
        await request(app())
          .delete('/api/diagram-nodes')
          .send({ diagram: 'container', node: 'architect' })
      ).status,
    ).toBe(404);
    expect(
      (await request(app()).delete('/api/diagram-nodes').send({ diagram: 'ghost', node: 'a' }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app())
          .delete('/api/diagram-nodes')
          .send({ diagram: 'container', node: '../x' })
      ).status,
    ).toBe(400);
    expect(await treeState()).toEqual(before);
  });
});

describe('delete-element edge scrub is DIAGRAM-LOCAL (A2 review FIX 3)', () => {
  it('REPRODUCED CASE: typed ref of the deleted kind + same-slug survivor of another kind — edges scrub with the ref', async () => {
    // Survivor: actor "billing" exists alongside domain "billing". Deleting
    // the DOMAIN removes the container diagram's only billing node ref
    // (`- domain: billing`) — after which its edges CANNOT survive: the
    // loader resolves edge endpoints against the diagram's own nodes, so a
    // kept edge reloads as an error-severity dangling-edge-ref (the exact
    // failure the reviewers reproduced against the tree-global rule).
    await request(app()).post('/api/elements').send({ kind: 'actor', name: 'Billing' });
    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'domain' });
    expect(res.status).toBe(200);
    expect(res.body.scrubbedDiagrams).toEqual(['container']);

    const parsed = parseDiagramYaml(await read(CONTAINER_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.nodes).not.toContainEqual({ domain: 'billing' });
    expect(parsed.data.edges.some((e) => e.from === 'billing' || e.to === 'billing')).toBe(false);

    // The load-bearing assertion: NO error-severity diagnostics on reload.
    const model = await getModel();
    const errors = (model.body.diagnostics as { severity: string }[]).filter(
      (d) => d.severity === 'error',
    );
    expect(errors).toEqual([]);
  });

  it('edges SURVIVE when another node ref for the slug remains on the SAME diagram', async () => {
    // The adjacent gap: the diagram carries BOTH the typed ref of the
    // deleted kind AND a bare ref that re-resolves to the survivor. The
    // typed ref goes; the bare ref stays; the edges must stay with it.
    const original = await read(CONTAINER_DIAGRAM);
    await writeFile(
      join(dir, CONTAINER_DIAGRAM),
      original.replace('  - domain: billing\n', '  - domain: billing\n  - slug: billing\n'),
    );
    await request(app()).post('/api/elements').send({ kind: 'actor', name: 'Billing' });

    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'domain' });
    expect(res.status).toBe(200);

    const parsed = parseDiagramYaml(await read(CONTAINER_DIAGRAM));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.nodes).not.toContainEqual({ domain: 'billing' });
    expect(parsed.data.nodes).toContainEqual({ slug: 'billing' });
    expect(parsed.data.edges.some((e) => e.from === 'billing')).toBe(true);

    const model = await getModel();
    const errors = (model.body.diagnostics as { severity: string }[]).filter(
      (d) => d.severity === 'error',
    );
    expect(errors).toEqual([]);
  });
});

describe('validate-before-write ordering (A2 review FIX 4)', () => {
  it('a schema-invalid create leaves NO file behind (gate precedes writeFile)', async () => {
    // FeatureElement has no `tags` field, so this create serializes to a
    // file its own schema rejects — the one public-API path that reaches
    // the create gate. If the write were reordered before the gate, the
    // file would exist despite the 400.
    const before = await treeState();
    const res = await request(app())
      .post('/api/elements')
      .send({ kind: 'feature', name: 'Zap', tags: ['x'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schema-invalid feature/);
    expect(res.body.issues).toBeDefined();
    expect(await allFiles()).not.toContain('.workspec/features/zap.yaml');
    expect(await treeState()).toEqual(before);
  });
});

describe('Host-header guard on the API (DNS-rebinding backstop)', () => {
  it('403s a hostile Host on every mutation route, with zero side effects', async () => {
    const before = await treeState();
    const shared = app();
    for (const [method, url, body] of [
      ['post', '/api/elements', { kind: 'actor', name: 'Mallory' }],
      ['patch', '/api/elements', { slug: 'architect', name: 'X' }],
      ['delete', '/api/elements', { slug: 'architect' }],
      ['delete', '/api/diagram-nodes', { diagram: 'container', node: 'api-server' }],
      [
        'post',
        '/api/relations',
        { diagram: 'system-context', from: 'architect', to: '__system__' },
      ],
    ] as const) {
      const res = await request(shared)[method](url).set('Host', 'evil.example').send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(await treeState()).toEqual(before);
  });

  it('403s a hostile Host on the .layout/ PUT — the OTHER working-tree write route', async () => {
    // The blocking regression this test exists for: the guard used to be
    // mounted on the mutation router only, and reviewers landed a confirmed
    // 204 through `PUT /api/file` with a rebinding-shaped Host, replacing a
    // diagram's pins with attacker-supplied content.
    const before = await treeState();
    const res = await request(app())
      .put('/api/file')
      .query({ path: '.workspec/diagrams/.layout/system-context.yaml' })
      .set('Host', 'evil.example')
      .send({ content: 'version: 1\nnodes: {}\n' });
    expect(res.status).toBe(403);
    expect(await treeState()).toEqual(before);
  });

  it('403s a hostile Host on the READ routes too — no cross-origin .workspec exfil', async () => {
    // The guard covers reads as well: `GET /api/file` would otherwise hand a
    // rebinding page the contents of a developer's working tree, which is
    // not something ordinary navigation grants it.
    const shared = app();
    for (const [url, query] of [
      ['/api/model', {}],
      ['/api/files', { dir: '.workspec/actors' }],
      ['/api/file', { path: '.workspec/diagrams/system-context.yaml' }],
      ['/api/file-exists', { path: '.workspec/diagrams/system-context.yaml' }],
    ] as const) {
      const res = await request(shared).get(url).query(query).set('Host', 'evil.example');
      expect(res.status, url).toBe(403);
    }
  });

  it('allows localhost variants (any port) on both writes and reads', async () => {
    const shared = app();
    const ok = await request(shared)
      .post('/api/relations')
      .set('Host', 'localhost:9999')
      .send({ diagram: 'system-context', from: 'architect', to: 'payment-gateway' });
    expect(ok.status).toBe(201);

    const pin = await request(shared)
      .put('/api/file')
      .query({ path: '.workspec/diagrams/.layout/system-context.yaml' })
      .set('Host', '[::1]:4174')
      .send({ content: 'version: 1\nnodes: {}\n' });
    expect(pin.status).toBe(204);

    const model = await request(shared).get('/api/model').set('Host', '127.0.0.1:4174');
    expect(model.status).toBe(200);
  });

  it('allows the configured --host bind address, so a non-loopback bind still authors', async () => {
    // Without this, the documented `--host <addr>` flag served a page that
    // loaded fine and then 403'd every authoring gesture.
    const bound = createServer({ dir, bindHost: '192.168.1.5' });
    const ok = await request(bound)
      .post('/api/relations')
      .set('Host', '192.168.1.5:4174')
      .send({ diagram: 'system-context', from: 'architect', to: 'payment-gateway' });
    expect(ok.status).toBe(201);

    // …and only that address — the allowlist does not become a wildcard.
    const hostile = await request(bound).get('/api/model').set('Host', 'evil.example');
    expect(hostile.status).toBe(403);
  });
});

// A diagram authored the way a human authors one, carrying exactly the three
// shapes `yaml`'s printer cannot round-trip: a FOLDED (`>`) block scalar
// hand-wrapped narrower than the printer's width, a plain scalar longer than
// the printer's default 80-column `lineWidth`, and comments + blank lines
// around the edit site. A parse→stringify of this text differs from itself,
// which is what made every mutation reflow prose it never touched.
const HOSTILE_FORMATTING_DIAGRAM = [
  '# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/diagram.schema.json',
  'title: A deliberately long single-line plain scalar that runs well past the eighty column default',
  'type: c4-context',
  'description: >',
  '  Every published package plus the two consuming apps, and the real',
  '  workspace dependency edges between them (mined from each package.json).',
  '',
  '# the cast, in the order they appear',
  'nodes:',
  '  - slug: architect',
  '  - external-system: payment-gateway',
  '',
  '# how they talk to each other',
  'edges:',
  '  - from: architect',
  '    to: __system__',
  '    label: designs systems in',
  '',
  '  - from: __system__',
  '    to: payment-gateway',
  '    label: settles invoices via',
  '',
].join('\n');

const FORMATTED_DIAGRAM = '.workspec/diagrams/formatted.yaml';

describe('byte-exact preservation of hand-authored formatting (review FIX 2)', () => {
  beforeEach(async () => {
    await writeFile(join(dir, FORMATTED_DIAGRAM), HOSTILE_FORMATTING_DIAGRAM, 'utf8');
  });

  it('the fixture really is one `yaml` cannot round-trip (the trap this guards)', () => {
    // If this ever stops being true the fixture has lost its teeth and the
    // tests below would pass under a naive `doc.toString()` implementation.
    expect(parseDocument(HOSTILE_FORMATTING_DIAGRAM).toString()).not.toBe(
      HOSTILE_FORMATTING_DIAGRAM,
    );
  });

  it('deleting ONE edge changes only that edge lines — folded scalar, long scalar, comments and blank lines intact', async () => {
    const before = await read(FORMATTED_DIAGRAM);
    const res = await request(app())
      .delete('/api/relations')
      .send({ diagram: 'formatted', from: 'architect', to: '__system__' });
    expect(res.status).toBe(200);

    const after = await read(FORMATTED_DIAGRAM);
    const removed = ['  - from: architect', '    to: __system__', '    label: designs systems in'];
    expect(lineDiff(before, after)).toEqual({ added: [], removed });
    expectLinesRemovedInPlace(before, after, removed);

    // Named explicitly because these are the exact bytes that used to move:
    expect(after).toContain(
      'description: >\n  Every published package plus the two consuming apps, and the real\n  workspace dependency edges between them (mined from each package.json).',
    );
    expect(after).toContain(
      'title: A deliberately long single-line plain scalar that runs well past the eighty column default\n',
    );
    expect(after).toContain('# the cast, in the order they appear\n');
  });

  it('removing a diagram node changes only its ref + touching edge lines', async () => {
    const before = await read(FORMATTED_DIAGRAM);
    const res = await request(app())
      .delete('/api/diagram-nodes')
      .send({ diagram: 'formatted', node: 'payment-gateway' });
    expect(res.status).toBe(200);

    const after = await read(FORMATTED_DIAGRAM);
    const removed = [
      '  - external-system: payment-gateway',
      '  - from: __system__',
      '    to: payment-gateway',
      '    label: settles invoices via',
    ];
    expect(lineDiff(before, after)).toEqual({ added: [], removed });
    expectLinesRemovedInPlace(before, after, removed);
  });

  it('appending an edge adds ONLY the new edge lines', async () => {
    const before = await read(FORMATTED_DIAGRAM);
    const res = await request(app())
      .post('/api/relations')
      .send({ diagram: 'formatted', from: 'payment-gateway', to: 'architect', label: 'notifies' });
    expect(res.status).toBe(201);

    const after = await read(FORMATTED_DIAGRAM);
    expect(lineDiff(before, after)).toEqual({
      added: ['  - from: payment-gateway', '    to: architect', '    label: notifies'],
      removed: [],
    });
    // Positional: the appended lines sit at the end of `edges:`, and every
    // original line is byte-identical in place before them.
    expectLinesRemovedInPlace(after, before, [
      '  - from: payment-gateway',
      '    to: architect',
      '    label: notifies',
    ]);
  });

  it('re-labelling an edge rewrites ONLY that label line', async () => {
    const before = await read(FORMATTED_DIAGRAM);
    const res = await request(app())
      .patch('/api/relations')
      .send({ diagram: 'formatted', from: 'architect', to: '__system__', label: 'curates' });
    expect(res.status).toBe(200);

    const after = await read(FORMATTED_DIAGRAM);
    expect(lineDiff(before, after)).toEqual({
      added: ['    label: curates'],
      removed: ['    label: designs systems in'],
    });
    expect(after.split('\n').filter((l) => l !== '    label: curates')).toEqual(
      before.split('\n').filter((l) => l !== '    label: designs systems in'),
    );
  });

  it('renaming an element rewrites ONLY its title line, folded description untouched', async () => {
    const path = '.workspec/actors/formatted-actor.yaml';
    const element = [
      '# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/actor.schema.json',
      'title: Original',
      'description: >',
      '  Designs systems in WorkSpec and reviews proposed changes before they',
      '  reach the refinement board.',
      '',
      '# provenance',
      'tags:',
      '  - human',
      '',
    ].join('\n');
    await writeFile(join(dir, path), element, 'utf8');

    const res = await request(app())
      .patch('/api/elements')
      .send({ slug: 'formatted-actor', kind: 'actor', name: 'Renamed Architect' });
    expect(res.status).toBe(200);

    const after = await read(path);
    expect(lineDiff(element, after)).toEqual({
      added: ['title: Renamed Architect'],
      removed: ['title: Original'],
    });
    expect(after.split('\n').filter((l) => l !== 'title: Renamed Architect')).toEqual(
      element.split('\n').filter((l) => l !== 'title: Original'),
    );
  });

  it('a tree-wide element delete does not reflow the diagrams it scrubs', async () => {
    const before = await read(FORMATTED_DIAGRAM);
    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'payment-gateway', kind: 'external-system' });
    expect(res.status).toBe(200);

    const after = await read(FORMATTED_DIAGRAM);
    const removed = [
      '  - external-system: payment-gateway',
      '  - from: __system__',
      '    to: payment-gateway',
      '    label: settles invoices via',
    ];
    expect(lineDiff(before, after)).toEqual({ added: [], removed });
    expectLinesRemovedInPlace(before, after, removed);
  });
});

describe('one write queue per served tree — the .layout/ PUT rides it too', () => {
  /** Wraps a real queue, recording task entry/exit so overlap is observable. */
  function instrumented(): { queue: MutationQueue; events: string[] } {
    const events: string[] = [];
    const inner = createMutationQueue();
    const queue: MutationQueue = <T>(task: () => Promise<T>): Promise<T> =>
      inner(async () => {
        events.push('enter');
        try {
          return await task();
        } finally {
          events.push('exit');
        }
      });
    return { queue, events };
  }

  it('a .layout/ write and a diagram mutation SERIALIZE (never interleave)', async () => {
    // The blocking gap: `PUT /api/file` was registered straight on the app
    // and never saw the queue, while `removeDiagramNode`→`scrubLayoutRefs`
    // read-modify-writes the very same `.layout/` file. Unqueued, only ONE
    // enter/exit pair is recorded — this dies at `toHaveLength(4)`.
    const { queue, events } = instrumented();
    const shared = createServer({ dir, writeQueue: queue });

    const [pin, mutation] = await Promise.all([
      request(shared)
        .put('/api/file')
        .query({ path: CONTEXT_LAYOUT })
        .send({ content: 'version: 1\nnodes:\n  payment-gateway:\n    x: 12\n    y: 34\n' }),
      request(shared)
        .delete('/api/diagram-nodes')
        .send({ diagram: 'system-context', node: 'architect' }),
    ]);
    expect(pin.status).toBe(204);
    expect(mutation.status).toBe(200);

    expect(events).toHaveLength(4);
    expect(events).toEqual(['enter', 'exit', 'enter', 'exit']);
  });

  it('two concurrent .layout/ writes both land, one at a time', async () => {
    const { queue, events } = instrumented();
    const shared = createServer({ dir, writeQueue: queue });

    const [a, b] = await Promise.all([
      request(shared)
        .put('/api/file')
        .query({ path: CONTEXT_LAYOUT })
        .send({ content: 'version: 1\nnodes:\n  architect:\n    x: 1\n    y: 2\n' }),
      request(shared)
        .put('/api/file')
        .query({ path: '.workspec/diagrams/.layout/container.yaml' })
        .send({ content: 'version: 1\nnodes:\n  api-server:\n    x: 3\n    y: 4\n' }),
    ]);
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);

    expect(parseLayoutYaml(await read(CONTEXT_LAYOUT)).ok).toBe(true);
    expect(await read(CONTEXT_LAYOUT)).toContain('architect');
    expect(await read('.workspec/diagrams/.layout/container.yaml')).toContain('api-server');
    expect(events).toEqual(['enter', 'exit', 'enter', 'exit']);
  });
});

describe('delete-element layout-pin scoping (survivor keeps its position)', () => {
  it('keeps the .layout/ pin of a slug that SURVIVES on the diagram via a bare ref', async () => {
    // The degenerate-but-legal shape the pin scrub got wrong: one diagram
    // carries BOTH a typed ref of the deleted kind and a bare ref for the
    // same slug, and another kind bears that slug too. Deleting the typed
    // ref leaves the bare ref resolving to the survivor — the node is still
    // ON the diagram — but the scrub dropped its authored position anyway,
    // silently, so it re-laid-out somewhere else on the next load.
    await writeFile(
      join(dir, '.workspec/actors/billing.yaml'),
      '# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/actor.schema.json\ntitle: Billing Ops\ndescription: The humans who run billing.\n',
      'utf8',
    );
    const diagram = await read(CONTAINER_DIAGRAM);
    await writeFile(
      join(dir, CONTAINER_DIAGRAM),
      diagram.replace('  - domain: billing\n', '  - domain: billing\n  - slug: billing\n'),
      'utf8',
    );
    await writeFile(
      join(dir, '.workspec/diagrams/.layout/container.yaml'),
      'version: 1\nnodes:\n  billing:\n    x: 42\n    y: 84\n',
      'utf8',
    );

    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'domain' });
    expect(res.status).toBe(200);

    // The bare ref (and therefore the node) survives…
    const after = await read(CONTAINER_DIAGRAM);
    expect(after).toContain('  - slug: billing');
    expect(after).not.toContain('  - domain: billing');

    // …so its authored pin must survive with it.
    const layout = parseLayoutYaml(await read('.workspec/diagrams/.layout/container.yaml'));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes.billing).toEqual({ x: 42, y: 84 });

    // And the model still loads clean — no orphan-layout, no dangling ref.
    const model = await getModel();
    expect(
      (model.body.diagnostics as { severity: string }[]).filter((d) => d.severity === 'error'),
    ).toEqual([]);
  });

  it('still scrubs the pin when the slug leaves the diagram entirely', async () => {
    await writeFile(
      join(dir, '.workspec/diagrams/.layout/container.yaml'),
      'version: 1\nnodes:\n  billing:\n    x: 42\n    y: 84\n',
      'utf8',
    );
    const res = await request(app())
      .delete('/api/elements')
      .send({ slug: 'billing', kind: 'domain' });
    expect(res.status).toBe(200);

    const layout = parseLayoutYaml(await read('.workspec/diagrams/.layout/container.yaml'));
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes.billing).toBeUndefined();
  });
});
