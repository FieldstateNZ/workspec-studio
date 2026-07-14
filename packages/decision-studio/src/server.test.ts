import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Decision } from '@workspec/decision-schema';
import { createServer } from './server.js';

const HOSTING_DIR = fileURLToPath(new URL('../../../examples/hosting-platform', import.meta.url));
const DECISION_REF = 'hosting-platform.decision.yaml';
const CATALOG_REF = 'platform.catalog.yaml';

describe('host server — read API over the hosting-platform example', () => {
  // Per-test mkdtemp copy (not the shared examples/hosting-platform dir):
  // mirrors the write round-trip block below and c4-studio's server tests, so
  // this suite never shares a live fixture directory — read or write — with
  // any other suite in the monorepo, however many run in parallel.
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-host-read-'));
    await cp(join(HOSTING_DIR, DECISION_REF), join(dir, DECISION_REF));
    await cp(join(HOSTING_DIR, CATALOG_REF), join(dir, CATALOG_REF));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists the hosting-platform decision', async () => {
    const app = createServer({ dir });
    const res = await request(app).get('/api/decisions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'dec-hosting', ref: DECISION_REF })]),
    );
  });

  it('returns the hosting-platform decision with all four options', async () => {
    const app = createServer({ dir });
    const res = await request(app).get(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`);
    expect(res.status).toBe(200);
    const decision = res.body as Decision;
    expect(decision.metadata.id).toBe('dec-hosting');
    expect(decision.spec.options.map((o) => o.id)).toEqual(['aks', 'appsvc', 'ase', 'aca']);
  });

  it('returns the hosting-platform catalog', async () => {
    const app = createServer({ dir });
    const res = await request(app).get(`/api/catalog?ref=${encodeURIComponent(CATALOG_REF)}`);
    expect(res.status).toBe(200);
    expect(res.body.metadata.id).toBe('platform');
    expect(res.body.spec.skus.length).toBeGreaterThan(0);
  });

  it('404s a missing decision and 400s a traversal ref', async () => {
    const app = createServer({ dir });
    expect((await request(app).get('/api/decision?ref=nope.decision.yaml')).status).toBe(404);
    expect((await request(app).get('/api/decision?ref=../../../etc/passwd')).status).toBe(400);
  });

  // Issue #52: Windows drive-letter / UNC / backslash refs must be rejected
  // as client errors, not silently accepted (or turned into a 500) — the
  // request guard (`refFrom`) rejects these outright, regardless of which OS
  // this test runs on.
  it('400s Windows-shaped refs (drive-letter, UNC, backslash traversal)', async () => {
    const app = createServer({ dir });
    for (const ref of [
      String.raw`C:\evil\x.decision.yaml`,
      String.raw`\\srv\share\x.decision.yaml`,
      String.raw`sub\..\..\evil.decision.yaml`,
    ]) {
      const res = await request(app).get(`/api/decision?ref=${encodeURIComponent(ref)}`);
      expect(res.status).toBe(400);
    }
  });

  it('400s a PUT to a Windows-shaped ref instead of writing or 500ing', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put(`/api/decision?ref=${encodeURIComponent(String.raw`C:\evil\x.decision.yaml`)}`)
      .send({ apiVersion: 'workspec.io/v1alpha1', kind: 'Decision', metadata: {} });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid decision write with 400 (Zod-validated)', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`)
      .send({ apiVersion: 'workspec.io/v1alpha1', kind: 'Decision', metadata: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid decision');
  });

  // A ref of "." passes `refFrom` (no leading /, no .., no backslash, no
  // drive letter) and resolves — legitimately, per `resolveWithinRoot` — to
  // the served root itself, which is a directory. `readFile` on a directory
  // throws EISDIR: an unclassified error (not RefEscapesRootError, not
  // ArtifactValidationError, not ENOENT), so it falls through to the generic
  // 500 fallback. Before the fix, that fallback echoed `(error as
  // Error).message` — which for a filesystem error can carry the absolute
  // served path — straight into the response body. It must not.
  it('500s a ref of "." (served root, EISDIR) with a generic body — no path or ref leaked', async () => {
    const app = createServer({ dir });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).get('/api/decision?ref=.');
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
});

describe('host server — write round-trip through the port', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-host-write-'));
    await cp(join(HOSTING_DIR, DECISION_REF), join(dir, DECISION_REF));
    await cp(join(HOSTING_DIR, CATALOG_REF), join(dir, CATALOG_REF));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persists a validated decision and reads it back', async () => {
    const app = createServer({ dir });
    const read = await request(app).get(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`);
    const decision = read.body as Decision;
    decision.metadata.title = 'Edited via the host API';

    const write = await request(app)
      .put(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`)
      .send(decision);
    expect(write.status).toBe(204);

    const reread = await request(app).get(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`);
    expect((reread.body as Decision).metadata.title).toBe('Edited via the host API');
  });

  it('500s a PUT to ref "." (served root, EISDIR on write) with a generic body — no path leaked', async () => {
    const app = createServer({ dir });
    const read = await request(app).get(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).put('/api/decision?ref=.').send(read.body as Decision);
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
