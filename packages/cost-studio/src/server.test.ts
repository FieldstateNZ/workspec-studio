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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attribution, Inventory } from '@workspec/cost-schema';
import { createServer } from './server.js';
import { FsRepository } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function makeInventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { id: 'estate' },
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
    metadata: { id: 'attr' },
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
  await repo.writeInventory('estate.inventory.yaml', makeInventory());
  await repo.writeAttribution('attr.attribution.yaml', makeAttribution());
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
    expect(list.body).toEqual([{ ref: 'estate.inventory.yaml', id: 'estate' }]);

    const read = await request(app).get(
      `/api/inventory?ref=${encodeURIComponent('estate.inventory.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect((read.body as Inventory).metadata.id).toBe('estate');
    expect((read.body as Inventory).spec.resources).toHaveLength(2);
  });

  it('lists and reads an attribution', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/attributions');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ref: 'attr.attribution.yaml', id: 'attr' }]);

    const read = await request(app).get(
      `/api/attribution?ref=${encodeURIComponent('attr.attribution.yaml')}`,
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
});

describe('host server — write round-trip through the port', () => {
  it('persists a validated attribution write and reads it back, byte-stable on disk', async () => {
    const app = createServer({ dir });
    const ref = 'attr.attribution.yaml';
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
    const before = await readFile(join(dir, 'estate.inventory.yaml'), 'utf8');
    const res = await request(app)
      .put(`/api/inventory?ref=${encodeURIComponent('estate.inventory.yaml')}`)
      .send({ apiVersion: 'workspec.io/v1alpha1', kind: 'Inventory', metadata: {} });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid inventory');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(must(res.body.issues[0]).path).toBeDefined();

    // The file on disk is untouched by the rejected write.
    const after = await readFile(join(dir, 'estate.inventory.yaml'), 'utf8');
    expect(after).toBe(before);
  });

  it('surfaces a corrupt on-disk artifact as 422 on read, via ArtifactValidationError', async () => {
    const app = createServer({ dir });
    // Overwrite the valid fixture directly (bypassing schema validation) to
    // simulate a hand-edited bad file — no writer of this repository would
    // ever produce this, but a human editing YAML directly can.
    await writeFile(
      join(dir, 'estate.inventory.yaml'),
      ['apiVersion: workspec.io/v1alpha1', 'kind: Inventory', 'metadata: {}', 'spec: {}', ''].join(
        '\n',
      ),
    );
    const res = await request(app).get(
      `/api/inventory?ref=${encodeURIComponent('estate.inventory.yaml')}`,
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
