// End-to-end reachability test for the client write surface (A2 review
// FIX 5): everything imports from the barrel the A1 shell consumes
// (`src/client/index.js`), the API is the REAL fetch-backed one against a
// REAL bound server over a REAL temp working tree, and the store is a real
// `@workspec/canvas` instance — the full path a canvas delete gesture
// takes, minus only the React layer (covered by c4-ui's own contract
// tests).

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvasStore } from '@workspec/canvas';
import { nodeShapeId, registerC4 } from '@workspec/c4-ui';
import type { C4NodeShape } from '@workspec/c4-ui';
import type { Shape, ShapeId } from '@workspec/canvas';
import { parseDiagramYaml, parseLayoutYaml } from '@workspec/c4-schema';
import { createServer } from '../server.js';
import { createMutationApi, installStudioCanvasHost } from './index.js';

const REPRESENTATIVE_DIR = fileURLToPath(
  new URL('../../../c4-schema/test/fixtures/representative', import.meta.url),
);

let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-e2e-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
  server = createServer({ dir }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

describe('studio host against a live server (barrel imports)', () => {
  it('deleteShapes on a c4node hits the diagram-scoped route and mutates the tree', async () => {
    const instance = createCanvasStore();
    registerC4(instance);
    const shape: C4NodeShape = {
      id: nodeShapeId('architect'),
      type: 'c4node',
      index: 'a1',
      x: 0,
      y: 0,
      width: 300,
      height: 110,
      slug: 'architect',
      nodeType: 'actor',
      label: 'Architect',
      meta: { ephemeral: true, slug: 'architect' },
    };
    instance.getState()._setShapesRaw({ [shape.id]: shape } as Record<ShapeId, Shape>);

    const onMutated = vi.fn();
    const onWriteError = vi.fn();
    installStudioCanvasHost(instance, {
      diagramSlug: () => 'system-context',
      api: createMutationApi(base),
      onMutated,
      onWriteError,
    });

    instance.getState().deleteShapes([shape.id]);
    // Optimistic local removal is immediate; the server write settles async.
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
    await vi.waitFor(() => {
      expect(onMutated).toHaveBeenCalledTimes(1);
    });
    expect(onWriteError).not.toHaveBeenCalled();

    // Diagram-scoped semantics on the REAL tree: the node ref and its edge
    // are gone from the diagram; the layout pin + hint are scrubbed…
    const diagram = parseDiagramYaml(
      await readFile(join(dir, '.workspec/diagrams/system-context.yaml'), 'utf8'),
    );
    expect(diagram.ok).toBe(true);
    if (!diagram.ok) throw new Error('unreachable');
    expect(diagram.data.nodes).toEqual([{ 'external-system': 'payment-gateway' }]);
    expect(diagram.data.edges.some((e) => e.from === 'architect')).toBe(false);

    const layout = parseLayoutYaml(
      await readFile(join(dir, '.workspec/diagrams/.layout/system-context.yaml'), 'utf8'),
    );
    expect(layout.ok).toBe(true);
    if (!layout.ok) throw new Error('unreachable');
    expect(layout.data.nodes['architect']).toBeUndefined();

    // …and the element FILE survives (the gesture never deletes elements).
    const element = await readFile(join(dir, '.workspec/actors/architect.yaml'), 'utf8');
    expect(element).toContain('title: Architect');
  });
});
