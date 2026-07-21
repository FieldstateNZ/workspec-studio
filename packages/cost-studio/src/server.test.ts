// The host server, driven with supertest against a real `FsRepository` on a
// temp directory (no example fixtures ship for cost artifacts yet, so the
// fixtures here are built the same way `fs-repository.test.ts` and
// `acceptance.test.ts` build theirs). Mirrors
// `@workspec/decision-studio`'s `server.test.ts` shape, scaled to the four
// cost artifact kinds, plus the traversal-ref and invalid-write cases.

import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attribution, Inventory } from '@workspec/cost-schema';
import { createServer } from './server.js';
import { FsRepository } from './fs-repository.js';
import { createCostMcpProvider } from './mcp-provider.js';

// MCP transport requires both content types in Accept; a canonical initialize body.
const MCP_ACCEPT = 'application/json, text/event-stream';
const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'server-test', version: '0.0.0' },
  },
};

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function makeInventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'estate' },
    spec: {
      asOf: '2026-07-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        {
          id: 'res-a',
          name: 'A',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
        },
        {
          id: 'res-b',
          name: 'B',
          type: 'Microsoft.Storage/storageAccounts',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
        },
      ],
    },
  };
}

function makeAttribution(): Attribution {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug: 'attr' },
    spec: {
      dimensions: [{ id: 'product', label: 'Product', values: ['atrium', 'workspec'] }],
      rules: [
        {
          id: 'r1',
          name: 'VMs to atrium',
          match: { resourceType: 'Microsoft.Compute/virtualMachines' },
          assign: { product: 'atrium' },
        },
        { id: 'r2', name: 'Catch-all', match: {}, assign: { product: 'workspec' } },
      ],
    },
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cost-studio-host-'));
  const repo = new FsRepository(dir);
  await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
  await repo.writeAttribution('.workspec/attributions/attr.yaml', makeAttribution());
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('host server — health + read APIs', () => {
  it('reports health with the served directory', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, dir });
  });

  it('lists and reads an inventory', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/inventories');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ref: '.workspec/inventories/estate.yaml', slug: 'estate' }]);

    const read = await request(app).get(
      `/api/inventory?ref=${encodeURIComponent('.workspec/inventories/estate.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect((read.body as Inventory).metadata.slug).toBe('estate');
    expect((read.body as Inventory).spec.resources).toHaveLength(2);
  });

  it('lists and reads an attribution', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/attributions');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ref: '.workspec/attributions/attr.yaml', slug: 'attr' }]);

    const read = await request(app).get(
      `/api/attribution?ref=${encodeURIComponent('.workspec/attributions/attr.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect((read.body as Attribution).spec.rules.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('lists spends and tag plans (empty in this fixture)', async () => {
    const app = createServer({ dir });
    expect((await request(app).get('/api/spends')).body).toEqual([]);
    expect((await request(app).get('/api/tagplans')).body).toEqual([]);
  });

  it('404s a missing artifact and 400s a traversal ref, for every kind', async () => {
    const app = createServer({ dir });
    for (const singular of ['inventory', 'spend', 'attribution', 'tagplan']) {
      expect(
        (await request(app).get(`/api/${singular}?ref=nope.${singular}.yaml`)).status,
      ).toBe(404);
      expect(
        (await request(app).get(`/api/${singular}?ref=../../../etc/passwd`)).status,
      ).toBe(400);
      expect((await request(app).get(`/api/${singular}`)).status).toBe(400); // missing ref
    }
  });

  // Issue #52: Windows drive-letter / UNC / backslash refs must be rejected
  // as client errors, not silently accepted (or turned into a 500) — the
  // request guard (`refFrom`) rejects these outright, regardless of which OS
  // this test runs on.
  it('400s Windows-shaped refs (drive-letter, UNC, backslash traversal), for every kind', async () => {
    const app = createServer({ dir });
    for (const singular of ['inventory', 'spend', 'attribution', 'tagplan']) {
      for (const ref of [
        String.raw`C:\evil\x.${singular}.yaml`,
        String.raw`\\srv\share\x.${singular}.yaml`,
        String.raw`sub\..\..\evil.${singular}.yaml`,
      ]) {
        const res = await request(app).get(`/api/${singular}?ref=${encodeURIComponent(ref)}`);
        expect(res.status).toBe(400);
      }
    }
  });

  // A ref of "." passes `refFrom` (no leading /, no .., no backslash, no
  // drive letter) and resolves — legitimately, per `resolveWithinRoot` — to
  // the served root itself, which is a directory. `readFile` on a directory
  // throws EISDIR: an unclassified error (not RefEscapesRootError, not
  // ArtifactValidationError, not ENOENT), so it falls through to the generic
  // 500 fallback. Before the fix, that fallback echoed `(error as
  // Error).message` — which for a filesystem error can carry the absolute
  // served path — straight into the response body. It must not, for any of
  // the four artifact kinds.
  it('500s a ref of "." (served root, EISDIR) with a generic body — no path or ref leaked', async () => {
    const app = createServer({ dir });
    for (const singular of ['inventory', 'spend', 'attribution', 'tagplan']) {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const res = await request(app).get(`/api/${singular}?ref=.`);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'internal error' });
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain(dir);
        expect(raw).not.toContain('EISDIR');
        // Debuggability is preserved: the real error still reaches the server log.
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    }
  });
});

describe('host server — write round-trip through the port', () => {
  it('persists a validated attribution write and reads it back, byte-stable on disk', async () => {
    const app = createServer({ dir });
    const ref = '.workspec/attributions/attr.yaml';
    const read = await request(app).get(`/api/attribution?ref=${encodeURIComponent(ref)}`);
    const attribution = read.body as Attribution;
    attribution.spec.rules = [
      ...attribution.spec.rules,
      { id: 'r3', name: 'Extra rule', match: {}, assign: { product: 'atrium' } },
    ];

    const write = await request(app)
      .put(`/api/attribution?ref=${encodeURIComponent(ref)}`)
      .send(attribution);
    expect(write.status).toBe(204);

    const reread = await request(app).get(`/api/attribution?ref=${encodeURIComponent(ref)}`);
    expect((reread.body as Attribution).spec.rules.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);

    // Byte-stable: the bytes the HTTP PUT left on disk are exactly what
    // calling the repository directly with the same (now-validated) data
    // would produce — the server is a pass-through to
    // `FsRepository.writeAttribution`, adding no serialization step of its
    // own.
    const viaHttp = await readFile(join(dir, ref), 'utf8');
    const directRepo = new FsRepository(dir);
    await directRepo.writeAttribution(ref, reread.body as Attribution);
    const viaDirect = await readFile(join(dir, ref), 'utf8');
    expect(viaDirect).toBe(viaHttp);
  });

  it('400s a PUT to a Windows-shaped ref instead of writing or 500ing', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put(`/api/inventory?ref=${encodeURIComponent(String.raw`C:\evil\x.inventory.yaml`)}`)
      .send(makeInventory());
    expect(res.status).toBe(400);
  });

  it('rejects an invalid inventory write with 422 (located issues, no write)', async () => {
    const app = createServer({ dir });
    const before = await readFile(join(dir, '.workspec/inventories/estate.yaml'), 'utf8');
    const res = await request(app)
      .put(`/api/inventory?ref=${encodeURIComponent('.workspec/inventories/estate.yaml')}`)
      .send({ apiVersion: 'workspec.io/v1alpha1', kind: 'Inventory', metadata: {} });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid inventory');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(must(res.body.issues[0]).path).toBeDefined();

    // The file on disk is untouched by the rejected write.
    const after = await readFile(join(dir, '.workspec/inventories/estate.yaml'), 'utf8');
    expect(after).toBe(before);
  });

  it('500s a PUT to ref "." (served root, EISDIR on write) with a generic body — no path leaked', async () => {
    const app = createServer({ dir });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).put('/api/inventory?ref=.').send(makeInventory());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'internal error' });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(dir);
      expect(raw).not.toContain('EISDIR');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('surfaces a corrupt on-disk artifact as 422 on read, via ArtifactValidationError', async () => {
    const app = createServer({ dir });
    // Overwrite the valid fixture directly (bypassing schema validation) to
    // simulate a hand-edited bad file — no writer of this repository would
    // ever produce this, but a human editing YAML directly can.
    await writeFile(
      join(dir, '.workspec/inventories/estate.yaml'),
      ['apiVersion: workspec.io/v1alpha1', 'kind: Inventory', 'metadata: {}', 'spec: {}', ''].join(
        '\n',
      ),
    );
    const res = await request(app).get(
      `/api/inventory?ref=${encodeURIComponent('.workspec/inventories/estate.yaml')}`,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid artifact');
  });
});

describe('host server — static client + SPA fallback', () => {
  it('serves the built client index.html for a non-/api GET when dist/client exists', async () => {
    const clientDir = fileURLToPath(new URL('../dist/client', import.meta.url));
    if (!existsSync(join(clientDir, 'index.html'))) {
      // Not built in this test run — skip gracefully rather than fail the suite
      // (mirrors how the standalone hosts treat an absent client build).
      return;
    }
    const app = createServer({ dir, clientDir });
    const res = await request(app).get('/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it('returns a plain-text hint at "/" when no client dir is configured at all', async () => {
    // No `clientDir` override and no built `dist/client` alongside this
    // module's own location (the src/ dir under test) — `defaultClientDir()`
    // finds nothing, so the API-only hint branch is what actually runs,
    // regardless of whether a real client build happened to exist elsewhere.
    const app = createServer({ dir });
    const clientDir = fileURLToPath(new URL('../dist/client', import.meta.url));
    if (existsSync(join(clientDir, 'index.html'))) {
      // A prior build IS visible to defaultClientDir() from this test's own
      // module location — the hint branch can't be exercised without faking
      // that away, so skip rather than assert something build-order-dependent.
      return;
    }
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Cost Studio API is running');
  });
});

describe('host server — MCP mount (smoke)', () => {
  it('is absent without an mcpProvider', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    // No route registered at all: falls through to the SPA/API-hint catch-all,
    // never a 200 MCP response.
    expect(res.status).not.toBe(200);
  });

  it('initializes an MCP session at /mcp when mcpProvider is supplied', async () => {
    const mcpProvider = createCostMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(200);
    // Response mode defaults to SSE (`text/event-stream`), one `data: <json>`
    // line — see `mount-mcp-http.test.ts` in @workspec/mcp-core for the same
    // parsing approach.
    const dataLine = res.text.split('\n').find((line: string) => line.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const body = JSON.parse((dataLine as string).slice('data: '.length)) as {
      result: { serverInfo: { name: string } };
    };
    expect(body.result.serverInfo.name).toBe('workspec-mcp');
  });

  it('rejects a hostile Host header with 403 through the mounted app', async () => {
    const mcpProvider = createCostMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Host', 'evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(403);
  });

  it('rejects a hostile cross-origin Origin header with 403 through the mounted app', async () => {
    const mcpProvider = createCostMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Origin', 'https://evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(403);
  });

  it('allows a legitimate localhost request (200)', async () => {
    const mcpProvider = createCostMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Origin', 'http://127.0.0.1:4173')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(200);
  });

  it('drives cost_list_inventories via tools/call over /mcp end-to-end', async () => {
    const mcpProvider = createCostMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'cost_list_inventories', arguments: {} },
      });

    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((line: string) => line.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const body = JSON.parse((dataLine as string).slice('data: '.length)) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).not.toBe(true);
    // The tool returns the inventory list as JSON text; the seeded "estate"
    // inventory must be in it.
    const block = body.result.content[0];
    if (block === undefined) throw new Error('expected a content block');
    const inventories = JSON.parse(block.text) as { slug: string }[];
    expect(inventories.some((i) => i.slug === 'estate')).toBe(true);
  });
});
