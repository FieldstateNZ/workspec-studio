import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('rejects an invalid decision write with 400 (Zod-validated)', async () => {
    const app = createServer({ dir });
    const res = await request(app)
      .put(`/api/decision?ref=${encodeURIComponent(DECISION_REF)}`)
      .send({ apiVersion: 'workspec.io/v1alpha1', kind: 'Decision', metadata: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid decision');
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
});
