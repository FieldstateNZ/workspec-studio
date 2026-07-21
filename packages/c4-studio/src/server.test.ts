import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFsSource } from '@workspec/c4-model/fs';
import { parseLayoutYaml } from '@workspec/c4-schema';
import { createC4McpProvider } from './mcp-provider.js';
import { createServer } from './server.js';

const REPRESENTATIVE_DIR = fileURLToPath(
  new URL('../../c4-schema/test/fixtures/representative', import.meta.url),
);
const LAYOUT_PATH = '.workspec/diagrams/.layout/system-context.yaml';

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
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-srv-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('host server — GET /api/model over a real tree', () => {
  it('loads the tree and returns every diagram', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/model');
    expect(res.status).toBe(200);
    // The fixture's one known warning (architect.yaml's dangling `~/` link) —
    // no error-severity diagnostics.
    expect(res.body.diagnostics).toHaveLength(1);
    expect(res.body.diagnostics[0].severity).toBe('warning');
    const slugs = (res.body.diagrams as { slug: string }[]).map((d) => d.slug);
    expect(slugs).toEqual(expect.arrayContaining(['system-context', 'container']));
  });

  it('reports health with the served directory', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('host server — generic C4FileSource proxy', () => {
  it('lists, reads, and checks existence of a real file', async () => {
    const app = createServer({ dir });

    const files = await request(app).get('/api/files').query({ dir: '.workspec/actors' });
    expect(files.status).toBe(200);
    expect(files.body).toContain('.workspec/actors/architect.yaml');

    const file = await request(app)
      .get('/api/file')
      .query({ path: '.workspec/actors/architect.yaml' });
    expect(file.status).toBe(200);
    expect(file.body.content).toContain('Architect');

    const exists = await request(app)
      .get('/api/file-exists')
      .query({ path: '.workspec/actors/architect.yaml' });
    expect(exists.status).toBe(200);
    expect(exists.body.exists).toBe(true);

    const missing = await request(app)
      .get('/api/file-exists')
      .query({ path: '.workspec/actors/nobody.yaml' });
    expect(missing.body.exists).toBe(false);
  });

  it('404s a missing file and 400s a traversal path', async () => {
    const app = createServer({ dir });
    expect(
      (await request(app).get('/api/file').query({ path: '.workspec/actors/nobody.yaml' })).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/file').query({ path: '../../../etc/passwd' })).status,
    ).toBe(400);
  });

  it('confines every read route to .workspec/** — in-root but outside-tree paths are 400, not served', async () => {
    // A real file OUTSIDE .workspec/ in the served root: reachable by a plain
    // relative path (no traversal), refused by the confinement gate — the
    // read-side mirror of the write path's isLayoutFile restriction.
    await writeFile(join(dir, 'secrets.env'), 'TOKEN=hunter2\n');

    const app = createServer({ dir });

    const read = await request(app).get('/api/file').query({ path: 'secrets.env' });
    expect(read.status).toBe(400);
    expect(JSON.stringify(read.body)).not.toContain('hunter2');

    expect((await request(app).get('/api/file-exists').query({ path: 'secrets.env' })).status).toBe(
      400,
    );
    expect((await request(app).get('/api/files').query({ dir: '.' })).status).toBe(400);
    expect((await request(app).get('/api/files').query({ dir: '.git' })).status).toBe(400);
    // A prefix-shaped near-miss must not slip through the startsWith check.
    expect(
      (await request(app).get('/api/file').query({ path: '.workspec-evil/x.yaml' })).status,
    ).toBe(400);

    // ...while the real tree stays fully readable.
    expect((await request(app).get('/api/files').query({ dir: '.workspec/actors' })).status).toBe(
      200,
    );
  });
});

describe('host server — drag-to-pin write-back through a temp dir', () => {
  it('writes a validated .layout/ file and the change is reflected on disk and in /api/model', async () => {
    const app = createServer({ dir });

    const content = [
      'version: 1',
      'nodes:',
      '  architect:',
      '    x: 999',
      '    y: 200',
      '    width: 240',
      '    height: 120',
      '  __system__:',
      '    x: 400',
      '    y: 200',
      'edges: {}',
      '',
    ].join('\n');

    const write = await request(app)
      .put('/api/file')
      .query({ path: LAYOUT_PATH })
      .send({ content });
    expect(write.status).toBe(204);

    // The change actually landed on disk (the "temp dir" of the acceptance criterion).
    const onDisk = await readFile(join(dir, LAYOUT_PATH), 'utf8');
    const parsed = parseLayoutYaml(onDisk);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.nodes.architect?.x).toBe(999);

    // ...and a fresh model load picks it up.
    const model = await request(app).get('/api/model');
    const diagram = (
      model.body.diagrams as {
        slug: string;
        layout: { data: { nodes: Record<string, { x: number }> } };
      }[]
    ).find((d) => d.slug === 'system-context');
    expect(diagram?.layout.data.nodes.architect?.x).toBe(999);
  });

  it('rejects writing to a non-.layout/ path', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put('/api/file')
      .query({ path: '.workspec/system/main-system.yaml' })
      .send({ content: 'title: Hijacked\n' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only permitted for \.layout\//);

    const untouched = await readFile(join(dir, '.workspec/system/main-system.yaml'), 'utf8');
    expect(untouched).not.toContain('Hijacked');
  });

  it('rejects an invalid Layout payload (Zod-validated before it reaches the tree)', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put('/api/file')
      .query({ path: LAYOUT_PATH })
      .send({ content: 'version: 1\nnodes:\n  architect: "not an object"\n' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid layout');
  });
});

// A path of `.workspec` passes `pathParam` (no leading /, no .., equals the
// confined WORKSPEC_DIR) and resolves — legitimately — to the served
// `.workspec/` directory itself. `readFile` on a directory throws EISDIR: an
// unclassified error (not ENOENT), so it falls through to the generic 500
// fallback. Before the fix, that fallback echoed `(error as Error).message`
// — which for a filesystem error can carry the absolute served path —
// straight into the response body. It must not, on read or write.
describe('host server — unclassified errors return a generic 500 (no path/message leak)', () => {
  it('500s a read of ".workspec" (EISDIR on a directory) with a generic body — no path leaked', async () => {
    const app = createServer({ dir });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).get('/api/file').query({ path: '.workspec' });
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
  });

  it('500s a layout write whose target collides with a directory (EISDIR) with a generic body — no path leaked', async () => {
    // A valid-layout PUT whose (isLayoutFile-legal) target path is occupied by
    // a directory: the write passes every gate and only fails at writeFile,
    // exercising the write catch's 500 fallback.
    const collide = '.workspec/diagrams/.layout/collide.yaml';
    await mkdir(join(dir, collide), { recursive: true });

    const app = createServer({ dir });
    const content = [
      'version: 1',
      'nodes:',
      '  __system__:',
      '    x: 400',
      '    y: 200',
      'edges: {}',
      '',
    ].join('\n');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).put('/api/file').query({ path: collide }).send({ content });
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

  it('initializes an MCP session at /mcp when mcpProvider is supplied, listing the c4 tools', async () => {
    const mcpProvider = createC4McpProvider(createFsSource(dir));
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
    const mcpProvider = createC4McpProvider(createFsSource(dir));
    const app = createServer({ dir, mcpProvider });

    const res = await request(app)
      .post('/mcp')
      .set('Host', 'evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(INITIALIZE_BODY);

    expect(res.status).toBe(403);
  });
});
