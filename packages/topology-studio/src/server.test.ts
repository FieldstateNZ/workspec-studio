// The host server, driven with supertest against a real `FsRepository` on a
// temp directory, seeded via `test-fixtures.ts`. Mirrors
// `@workspec/cost-studio`'s `server.test.ts` shape: health, list+get+put per
// kind, the traversal/Windows-shaped-ref/EISDIR-no-leak cases, the derived
// resolve/reconcile/cost endpoints, and the MCP mount smoke tests.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Environment, Topology } from '@workspec/topology-schema';
import { FsRepository } from './fs-repository.js';
import { createTopologyMcpProvider } from './mcp-provider.js';
import { createServer } from './server.js';
import { fixtureEnvironment, fixtureTopology, seedFixtureCatalog, seedFixtureTree } from './test-fixtures.js';

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

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'topology-studio-host-'));
  const repo = new FsRepository(dir);
  await seedFixtureTree(repo);
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

  it('lists and reads a topology', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/topologies');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ref: '.workspec/topologies/web-app.yaml', slug: 'web-app', title: 'Web App' }]);

    const read = await request(app).get(
      `/api/topology?ref=${encodeURIComponent('.workspec/topologies/web-app.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect((read.body as Topology).metadata.slug).toBe('web-app');
  });

  it('lists and reads a resource', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/resources');
    expect(list.status).toBe(200);
    expect(list.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/resources/app-service.yaml' })]),
    );

    const read = await request(app).get(
      `/api/resource?ref=${encodeURIComponent('.workspec/resources/app-service.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect(read.body.spec.cost.sku).toBe('app-service-p1v3');
  });

  it('lists and reads an environment', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/environments');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ref: '.workspec/environments/prod.yaml', slug: 'prod' }]);

    const read = await request(app).get(
      `/api/environment?ref=${encodeURIComponent('.workspec/environments/prod.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect((read.body as Environment).spec.naming?.resourceGroupSuffix).toBe('-prod');
  });

  it('404s a missing artifact and 400s a traversal ref, for every kind', async () => {
    const app = createServer({ dir });
    for (const singular of ['topology', 'resource', 'environment']) {
      expect((await request(app).get(`/api/${singular}?ref=nope.yaml`)).status).toBe(404);
      expect((await request(app).get(`/api/${singular}?ref=../../../etc/passwd`)).status).toBe(400);
      expect((await request(app).get(`/api/${singular}`)).status).toBe(400); // missing ref
    }
  });

  // Windows-shaped refs (drive-letter, UNC, backslash traversal) must be
  // rejected as client errors regardless of which OS this test runs on.
  it('400s Windows-shaped refs (drive-letter, UNC, backslash traversal), for every kind', async () => {
    const app = createServer({ dir });
    for (const singular of ['topology', 'resource', 'environment']) {
      for (const ref of [
        String.raw`C:\evil\x.yaml`,
        String.raw`\\srv\share\x.yaml`,
        String.raw`sub\..\..\evil.yaml`,
      ]) {
        const res = await request(app).get(`/api/${singular}?ref=${encodeURIComponent(ref)}`);
        expect(res.status).toBe(400);
      }
    }
  });

  // A ref of "." resolves (legitimately, per `resolveWithinRoot`) to the
  // served root itself — a directory. `readFile` on a directory throws
  // EISDIR, an unclassified error that must fall through to the generic 500
  // fallback without leaking the served root's absolute path.
  it('500s a ref of "." (served root, EISDIR) with a generic body — no path leaked', async () => {
    const app = createServer({ dir });
    for (const singular of ['topology', 'resource', 'environment']) {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const res = await request(app).get(`/api/${singular}?ref=.`);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'internal error' });
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain(dir);
        expect(raw).not.toContain('EISDIR');
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    }
  });
});

describe('host server — write round-trip through the port', () => {
  it('persists a validated resource write and reads it back', async () => {
    const app = createServer({ dir });
    const ref = '.workspec/resources/app-service.yaml';
    const read = await request(app).get(`/api/resource?ref=${encodeURIComponent(ref)}`);
    const resource = read.body;
    resource.spec.config = { tier: 'P2v3' };

    const write = await request(app).put(`/api/resource?ref=${encodeURIComponent(ref)}`).send(resource);
    expect(write.status).toBe(204);

    const reread = await request(app).get(`/api/resource?ref=${encodeURIComponent(ref)}`);
    expect(reread.body.spec.config).toEqual({ tier: 'P2v3' });
  });

  it('400s a PUT to a Windows-shaped ref instead of writing or 500ing', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put(`/api/environment?ref=${encodeURIComponent(String.raw`C:\evil\x.yaml`)}`)
      .send(fixtureEnvironment());
    expect(res.status).toBe(400);
  });

  it('rejects an invalid topology write with 422 (located issues, no write)', async () => {
    const app = createServer({ dir });
    const ref = '.workspec/topologies/web-app.yaml';
    const before = await readFile(join(dir, ref), 'utf8');
    const res = await request(app)
      .put(`/api/topology?ref=${encodeURIComponent(ref)}`)
      .send({ ...fixtureTopology(), spec: { ...fixtureTopology().spec, defaultEnvironment: 'nope' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid topology');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);

    const after = await readFile(join(dir, ref), 'utf8');
    expect(after).toBe(before);
  });
});

describe('host server — derived views (resolve / reconcile / cost)', () => {
  it('resolves the topology for prod', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/resolve?env=prod');
    expect(res.status).toBe(200);
    expect(res.body.envSlug).toBe('prod');
    expect(res.body.resources.map((r: { slug: string }) => r.slug).sort()).toEqual([
      'app-service',
      'client',
      'rg-app',
      'sql',
    ]);
  });

  it('400s an invalid env', async () => {
    const app = createServer({ dir });
    expect((await request(app).get('/api/resolve?env=Not_Valid')).status).toBe(400);
    expect((await request(app).get('/api/resolve')).status).toBe(400);
  });

  it('reconciles: everything phantom with nothing imported', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/reconcile?env=prod');
    expect(res.status).toBe(200);
    expect(res.body.summary.hasDrift).toBe(true);
    expect(res.body.summary.countsByClass.phantom).toBe(4);
  });

  it('computes cost against the seeded catalog', async () => {
    await seedFixtureCatalog(dir);
    const app = createServer({ dir });
    const res = await request(app).get('/api/cost?env=prod');
    expect(res.status).toBe(200);
    expect(res.body.totals.all).toBe(150);
  });

  it('404s cost when the catalog file is absent', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/cost?env=prod');
    expect(res.status).toBe(404);
  });

  it('422s resolve/reconcile/cost when the tree has no single topology', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'topology-studio-empty-'));
    try {
      const app = createServer({ dir: empty });
      expect((await request(app).get('/api/resolve?env=prod')).status).toBe(422);
      expect((await request(app).get('/api/reconcile?env=prod')).status).toBe(422);
      expect((await request(app).get('/api/cost?env=prod')).status).toBe(422);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('host server — tree read endpoints (browser client TopologyFileSource)', () => {
  it('lists, reads, and checks existence of tree files', async () => {
    const app = createServer({ dir });
    const list = await request(app).get('/api/tree/list?dir=.workspec/resources');
    expect(list.status).toBe(200);
    expect(list.body).toEqual(
      expect.arrayContaining(['.workspec/resources/app-service.yaml']),
    );

    const read = await request(app).get(
      `/api/tree/read?path=${encodeURIComponent('.workspec/resources/app-service.yaml')}`,
    );
    expect(read.status).toBe(200);
    expect(read.text).toContain('Web App Service');

    const exists = await request(app).get(
      `/api/tree/exists?path=${encodeURIComponent('.workspec/resources/app-service.yaml')}`,
    );
    expect(exists.status).toBe(200);
    expect(exists.body).toEqual({ exists: true });

    const notExists = await request(app).get('/api/tree/exists?path=.workspec/resources/nope.yaml');
    expect(notExists.body).toEqual({ exists: false });
  });

  it('400s a traversal dir/path', async () => {
    const app = createServer({ dir });
    expect((await request(app).get('/api/tree/list?dir=../../etc')).status).toBe(400);
    expect((await request(app).get('/api/tree/read?path=../../etc/passwd')).status).toBe(400);
  });
});

describe('host server — MCP mount (smoke)', () => {
  it('is absent without an mcpProvider', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res.status).not.toBe(200);
  });

  it('initializes an MCP session at /mcp when mcpProvider is supplied', async () => {
    const mcpProvider = createTopologyMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((line: string) => line.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const body = JSON.parse((dataLine as string).slice('data: '.length)) as {
      result: { serverInfo: { name: string } };
    };
    expect(body.result.serverInfo.name).toBe('workspec-mcp');
  });

  it('rejects a hostile Host header with 403 through the mounted app', async () => {
    const mcpProvider = createTopologyMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Host', 'evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(403);
  });

  it('drives topology_list_topologies via tools/call over /mcp end-to-end', async () => {
    const mcpProvider = createTopologyMcpProvider(new FsRepository(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'topology_list_topologies', arguments: {} },
      });

    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((line: string) => line.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const body = JSON.parse((dataLine as string).slice('data: '.length)) as {
      result: { content: { type: string; text: string }[] };
    };
    const topologies = JSON.parse(body.result.content[0]?.text ?? '[]') as { slug: string }[];
    expect(topologies).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'web-app' })]));
  });
});
