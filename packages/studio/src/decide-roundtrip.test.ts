// The decide flow, proven end-to-end to YAML on disk. The UI's `decide` helper
// (the same transform the ADR / Compare views apply) is written through the real
// `FsRepository`, then re-read from the file to confirm `status: decided` and the
// stamped outcome survive, and that the shared ADR renderer — the one the CLI's
// `render-adr` uses — carries the authored rationale. This closes the loop the
// component tests open (which drive decide through the React views over the
// in-memory double).

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';
import { decide, reopen } from '@workspec/decision-ui';
import { FsRepository } from './fs-repository.js';

const repoPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const HOSTING_DIR = repoPath('examples/hosting-platform');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-decide-'));
  await cp(HOSTING_DIR, dir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const RATIONALE = 'We accept a heavier ops burden in exchange for AKS scale headroom.';

describe('decide flow round-trips to YAML on disk', () => {
  it('writes status: decided + outcome, and render-adr carries the rationale', async () => {
    const repo = new FsRepository(dir);
    const [entry] = await repo.listDecisions();
    const ref = entry!.ref;
    const decision = await repo.readDecision(ref);
    const catalog = await repo.readCatalog(repo.resolveCatalogRef(ref, decision));

    const decided = decide(decision, 'aks', RATIONALE, {
      decidedBy: 'Platform Engineering',
      decidedAt: '2026-07-04',
    });
    await repo.writeDecision(ref, decided);

    // The YAML on disk carries the recorded outcome.
    const text = await readFile(join(dir, ref), 'utf8');
    expect(text).toContain('status: decided');
    expect(text).toContain('option: aks');
    expect(text).toContain(RATIONALE);

    // Re-reading validates, and the SAME renderer render-adr uses includes it.
    const reread = await repo.readDecision(ref);
    expect(reread.metadata.status).toBe('decided');
    expect(reread.spec.outcome?.option).toBe('aks');
    const markdown = renderAdrMarkdown(buildAdrModel(reread, catalog));
    expect(markdown).toContain('- **Status:** Accepted');
    expect(markdown).toContain('- **Decided by:** Platform Engineering');
    expect(markdown).toContain(RATIONALE);
  });

  it('reopen clears the outcome back to exploring on disk', async () => {
    const repo = new FsRepository(dir);
    const [entry] = await repo.listDecisions();
    const ref = entry!.ref;
    const decision = await repo.readDecision(ref);

    await repo.writeDecision(ref, decide(decision, 'aks', RATIONALE));
    const decidedOnDisk = await repo.readDecision(ref);
    await repo.writeDecision(ref, reopen(decidedOnDisk));

    const reopened = await repo.readDecision(ref);
    expect(reopened.metadata.status).toBe('exploring');
    expect(reopened.spec.outcome).toBeUndefined();
  });
});
