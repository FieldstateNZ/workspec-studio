import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { Decision } from '@workspec/decision-schema';
import { FsRepository } from './fs-repository.js';
import { createServer } from './server.js';

const artifact: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'runtime' },
  spec: {
    title: 'Choose a runtime',
    status: 'accepted',
    context: 'The service needs a supported runtime.',
    decision: 'Use Node.js.',
  },
};

describe('Decision Studio HTTP API', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('lists, reads, and writes Decisions only', async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-server-'));
    const ref = '.workspec/decisions/runtime.yaml';
    await new FsRepository(directory).writeDecision(ref, artifact);
    const app = createServer({ dir: directory });

    expect((await request(app).get('/api/decisions')).body).toEqual([
      { ref, slug: 'runtime', title: 'Choose a runtime' },
    ]);
    const read = await request(app).get(`/api/decision?ref=${encodeURIComponent(ref)}`);
    expect(read.status).toBe(200);
    const edited = {
      ...(read.body as Decision),
      spec: { ...(read.body as Decision).spec, decision: 'Use the current Node.js LTS.' },
    };
    expect(
      (
        await request(app)
          .put(`/api/decision?ref=${encodeURIComponent(ref)}`)
          .send(edited)
      ).status,
    ).toBe(204);
    expect(
      (await request(app).get(`/api/decision?ref=${encodeURIComponent(ref)}`)).body.spec.decision,
    ).toBe('Use the current Node.js LTS.');
    expect((await request(app).get('/api/catalogs')).status).toBe(404);
  });

  it('rejects invalid writes and escaping refs', async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-server-'));
    const app = createServer({ dir: directory });
    expect(
      (await request(app).put('/api/decision?ref=.workspec%2Fdecisions%2Fbad.yaml').send({}))
        .status,
    ).toBe(400);
    expect((await request(app).get('/api/decision?ref=..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
  });
});
