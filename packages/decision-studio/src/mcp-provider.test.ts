// Tests for `createDecisionMcpProvider` over a temp fixture dir — the same
// mkdtemp-per-test style `fs-repository.test.ts` and `server.test.ts` use, so
// this suite never shares a live fixture directory with any other suite.
//
// Tools are exercised directly via `tool.handler(args)` rather than through a
// full MCP client/transport: `McpToolDef.handler` is a plain async function,
// and `assemble-mcp-server.test.ts` (in `@workspec/mcp-core`) already covers
// the protocol-boundary (wire-name dispatch, isError-on-throw) behaviour this
// provider is mounted through.

import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpToolDef } from '@workspec/mcp-core';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { collectDiagnostics } from './collect-diagnostics.js';
import { FsRepository } from './fs-repository.js';
import { createDecisionMcpProvider } from './mcp-provider.js';

const HOSTING_DIR = fileURLToPath(new URL('../../../examples/hosting-platform', import.meta.url));
const INVALID_FIXTURES_DIR = fileURLToPath(
  new URL('../../../packages/decision-schema/test/fixtures/invalid', import.meta.url),
);
const DECISION_REF = '.workspec/decisions/hosting-platform.yaml';
const CATALOG_REF = '.workspec/catalogs/platform.yaml';

// The invalid-fixture battery from S1 (mirrors `cli.test.ts`'s
// `seedInvalidFixtures`): each fixture is copied into a fresh
// `.workspec/<kind-dir>/<slug>.yaml` under a bare slug filename — the old
// `<slug>.decision.yaml` / `<slug>.catalog.yaml` middle infix is not a valid
// slug, so it would be silently skipped by directory-based discovery.
const INVALID_FIXTURES: { file: string; kindDir: string; slug: string }[] = [
  { file: 'bad-status.decision.yaml', kindDir: 'decisions', slug: 'bad-status' },
  { file: 'missing-context.decision.yaml', kindDir: 'decisions', slug: 'missing-context' },
  {
    file: 'unknown-discriminator.decision.yaml',
    kindDir: 'decisions',
    slug: 'unknown-discriminator',
  },
  { file: 'negative-weight.decision.yaml', kindDir: 'decisions', slug: 'negative-weight' },
  { file: 'wrong-type-amount.decision.yaml', kindDir: 'decisions', slug: 'wrong-type-amount' },
  { file: 'dangling-env-key.decision.yaml', kindDir: 'decisions', slug: 'dangling-env-key' },
  { file: 'score-out-of-range.decision.yaml', kindDir: 'decisions', slug: 'score-out-of-range' },
  { file: 'bad-schedule-pct.catalog.yaml', kindDir: 'catalogs', slug: 'bad-schedule-pct' },
];

/** Copies the invalid-fixture battery into `root/.workspec/<kindDir>/<slug>.yaml`. */
async function seedInvalidFixtures(root: string): Promise<void> {
  for (const { file, kindDir, slug } of INVALID_FIXTURES) {
    const text = await readFile(join(INVALID_FIXTURES_DIR, file), 'utf8');
    const dest = join(root, '.workspec', kindDir, `${slug}.yaml`);
    await mkdir(join(root, '.workspec', kindDir), { recursive: true });
    await writeFile(dest, text, 'utf8');
  }
}

/** Finds a tool by its module-local name (not the namespaced wire name). */
function tool(repo: FsRepository, name: string): McpToolDef {
  const provider = createDecisionMcpProvider(repo);
  const found = provider.tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
}

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

/** Extracts the first text block from a `CallToolResult` (every tool here returns exactly one). */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return block.text;
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-mcp-'));
  await cp(join(HOSTING_DIR, DECISION_REF), join(dir, DECISION_REF));
  await cp(join(HOSTING_DIR, CATALOG_REF), join(dir, CATALOG_REF));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('list_catalogs / read_catalog', () => {
  it('lists the hosting-platform catalog', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'list_catalogs').handler({});
    expect(result.isError).not.toBe(true);
    const catalogs = JSON.parse(textOf(result)) as { ref: string; slug: string }[];
    expect(catalogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: CATALOG_REF, slug: 'platform' })]),
    );
  });

  it('reads the hosting-platform catalog by ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_catalog').handler({ ref: CATALOG_REF });
    expect(result.isError).not.toBe(true);
    const catalog = JSON.parse(textOf(result)) as { metadata: { slug: string } };
    expect(catalog.metadata.slug).toBe('platform');
  });

  it('reports an isError (not a throw) for a ref that escapes the served root', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_catalog').handler({ ref: '../../../etc/passwd' });
    expect(result.isError).toBe(true);
  });

  it('reports an isError (not a throw) for a missing ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_catalog').handler({ ref: '.workspec/catalogs/nope.yaml' });
    expect(result.isError).toBe(true);
  });
});

describe('list_decisions / read_decision', () => {
  it('lists the hosting-platform decision', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'list_decisions').handler({});
    expect(result.isError).not.toBe(true);
    const decisions = JSON.parse(textOf(result)) as { ref: string; slug: string }[];
    expect(decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: DECISION_REF, slug: 'hosting-platform' }),
      ]),
    );
  });

  it('reads the hosting-platform decision by ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_decision').handler({ ref: DECISION_REF });
    expect(result.isError).not.toBe(true);
    const decision = JSON.parse(textOf(result)) as { metadata: { slug: string } };
    expect(decision.metadata.slug).toBe('hosting-platform');
  });
});

describe('write_catalog', () => {
  it('rejects an invalid catalog: isError with issues, and the file is untouched', async () => {
    const repo = new FsRepository(dir);
    const before = await readFile(join(dir, CATALOG_REF), 'utf8');

    const valid = await repo.readCatalog(CATALOG_REF);
    const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
    // Break `spec.schedules[0].pct` (must be within its Zod range) — mirrors
    // the invalid fixture `fs-repository.test.ts` already uses.
    must((invalid.spec as { schedules: { pct: number }[] }).schedules[0]).pct = 1.5;

    const result = await tool(repo, 'write_catalog').handler({ ref: CATALOG_REF, catalog: invalid });

    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { issues: { path: string; message: string }[] };
    expect(body.issues.some((i) => i.path === 'spec.schedules.0.pct')).toBe(true);

    const after = await readFile(join(dir, CATALOG_REF), 'utf8');
    expect(after).toBe(before); // untouched
  });

  it('accepts a valid catalog: writes it, and it re-parses (header preserved)', async () => {
    const repo = new FsRepository(dir);
    const valid = await repo.readCatalog(CATALOG_REF);
    const edited = structuredClone(valid);
    must(edited.spec.skus[0]).price = 12345;

    const result = await tool(repo, 'write_catalog').handler({ ref: CATALOG_REF, catalog: edited });
    expect(result.isError).not.toBe(true);

    const written = await readFile(join(dir, CATALOG_REF), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    const reparsed = parseCatalogYaml(written);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(must(reparsed.data.spec.skus[0]).price).toBe(12345);
    }
  });

  it('reports an isError (not a throw) when ref escapes the served root', async () => {
    const repo = new FsRepository(dir);
    const valid = await repo.readCatalog(CATALOG_REF);
    const result = await tool(repo, 'write_catalog').handler({
      ref: '../outside.yaml',
      catalog: valid,
    });
    expect(result.isError).toBe(true);
  });

  it('rejects a backslash-traversal ref up front, creating no garbage file (issue #52)', async () => {
    // On POSIX, `..\..\x.yaml` is one literal filename — it would pass
    // `resolveWithinRoot` and get written inside root. The ref-shape pre-check
    // (`readRefArg`) rejects it before it reaches the repo.
    const repo = new FsRepository(dir);
    const valid = await repo.readCatalog(CATALOG_REF);
    const badRef = String.raw`..\..\x.yaml`;

    const result = await tool(repo, 'write_catalog').handler({ ref: badRef, catalog: valid });

    expect(result.isError).toBe(true);
    // Nothing named after the literal backslash ref was created in the root.
    const entries = await readFile(join(dir, CATALOG_REF), 'utf8').then(() => true);
    expect(entries).toBe(true); // the real catalog is still there
    await expect(readFile(join(dir, badRef), 'utf8')).rejects.toBeTruthy();
  });
});

describe('write_decision', () => {
  it('rejects an invalid decision: isError with issues, and the file is untouched', async () => {
    const repo = new FsRepository(dir);
    const before = await readFile(join(dir, DECISION_REF), 'utf8');

    const valid = await repo.readDecision(DECISION_REF);
    const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
    (invalid.spec as Record<string, unknown>).status = 'not-a-real-status';

    const result = await tool(repo, 'write_decision').handler({
      ref: DECISION_REF,
      decision: invalid,
    });

    expect(result.isError).toBe(true);
    const after = await readFile(join(dir, DECISION_REF), 'utf8');
    expect(after).toBe(before);
  });

  it('accepts a valid decision: writes it, and it re-parses', async () => {
    const repo = new FsRepository(dir);
    const valid = await repo.readDecision(DECISION_REF);

    const result = await tool(repo, 'write_decision').handler({ ref: DECISION_REF, decision: valid });
    expect(result.isError).not.toBe(true);

    const written = await readFile(join(dir, DECISION_REF), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(parseDecisionYaml(written).ok).toBe(true);
  });
});

describe('validate', () => {
  it('returns the same diagnostics shape collectDiagnostics produces, on a known-bad fixture', async () => {
    // `dir` already carries the valid hosting-platform decision + catalog
    // (seeded in `beforeEach`); layer the known-bad S1 fixture battery in
    // alongside them under their own slugs — the repo just sees more
    // artifacts, some clean and some broken.
    await seedInvalidFixtures(dir);
    const repo = new FsRepository(dir);
    const expected = await collectDiagnostics(repo);

    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    const diagnostics = JSON.parse(textOf(result)) as unknown[];

    expect(diagnostics).toEqual(expected);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('reports a clean result on the valid hosting-platform fixtures', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual([]);
  });

  it('scrubs the served-root path on an unreadable file (no leak, isError)', async (ctx) => {
    // Make the discovered catalog unreadable so `collectDiagnostics`'
    // `readFile` throws EACCES — whose raw `.message` carries the absolute
    // path. The tool must catch it and return a generic isError, never the
    // path. Skipped when the process can still read the file (e.g. running as
    // root, where mode bits are ignored) — the leak-scrub can't be exercised.
    const target = join(dir, CATALOG_REF);
    await chmod(target, 0o000);
    let stillReadable = false;
    try {
      await readFile(target, 'utf8');
      stillReadable = true;
    } catch {
      /* expected: unreadable */
    }
    if (stillReadable) {
      await chmod(target, 0o644);
      ctx.skip();
      return;
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const repo = new FsRepository(dir);
      const result = await tool(repo, 'validate').handler({});
      expect(result.isError).toBe(true);
      const text = textOf(result);
      expect(text).not.toContain(dir); // the served-root absolute path
      expect(text).not.toContain('EACCES');
      expect(text).toBe('internal error');
      // Debuggability preserved: the real error still reaches the server log.
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await chmod(target, 0o644); // let afterEach rm the temp dir cleanly
    }
  });
});

describe('render_adr', () => {
  it('renders the hosting-platform decision to Markdown, by slug', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'render_adr').handler({ decision: 'hosting-platform' });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('# Hosting platform for the data and delivery services');
  });

  it('renders the hosting-platform decision to Markdown, by ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'render_adr').handler({ decision: DECISION_REF });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('## Considered options');
  });

  it('reports an isError (not a throw) for an unknown decision', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'render_adr').handler({ decision: 'nope' });
    expect(result.isError).toBe(true);
  });
});
