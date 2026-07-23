// Tests for `createC4McpProvider` over a temp fixture dir — the same
// mkdtemp-per-test style `server.test.ts` uses, so this suite never shares
// a live fixture directory with any other suite.
//
// Tools are exercised directly via `tool.handler(args)` rather than through
// a full MCP client/transport: `McpToolDef.handler` is a plain async
// function, and `assemble-mcp-server.test.ts` (in `@workspec/mcp-core`)
// already covers the protocol-boundary (wire-name dispatch, isError-on-throw)
// behaviour this provider is mounted through — `server.test.ts`'s own "MCP
// mount (smoke)" block covers that this provider is actually reachable at
// `/mcp`.

import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsSource } from '@workspec/c4-model/fs';
import type { McpToolDef } from '@workspec/mcp-core';
import { createC4McpProvider } from './mcp-provider.js';

const REPRESENTATIVE_DIR = fileURLToPath(
  new URL('../../c4-schema/test/fixtures/representative', import.meta.url),
);
const SAMPLE_GRAPH = fileURLToPath(new URL('../test/fixtures/aspire/sample-graph.json', import.meta.url));
const LAYOUT_PATH = '.workspec/diagrams/.layout/system-context.yaml';

/** Finds a tool by its module-local name (not the namespaced wire name). */
function tool(dir: string, name: string): McpToolDef {
  const provider = createC4McpProvider(createFsSource(dir));
  const found = provider.tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
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
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-mcp-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('get_model', () => {
  it('loads the tree and returns every diagram, mirroring GET /api/model', async () => {
    const result = await tool(dir, 'get_model').handler({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result)) as {
      diagrams: { slug: string }[];
      diagnostics: { severity: string }[];
    };
    // The fixture's one known warning (architect.yaml's dangling `~/` link).
    expect(body.diagnostics).toHaveLength(1);
    expect(body.diagnostics[0]?.severity).toBe('warning');
    expect(body.diagrams.map((d) => d.slug)).toEqual(
      expect.arrayContaining(['system-context', 'container']),
    );
  });
});

describe('validate', () => {
  it('returns zero-error diagnostics for the clean representative fixture', async () => {
    const result = await tool(dir, 'validate').handler({});
    expect(result.isError).toBeFalsy();
    const diagnostics = JSON.parse(textOf(result)) as { severity: string; code: string }[];
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('warning');
  });

  it('reports a parse-error diagnostic for a tree with a schema-invalid element file', async () => {
    // Same invalid shape as @workspec/c4-schema's own
    // `test/fixtures/invalid/actor-missing-description.yaml`: a required
    // `description` field is missing.
    await writeFile(join(dir, '.workspec/actors/architect.yaml'), 'title: Architect\ntags:\n  - human\n');

    const result = await tool(dir, 'validate').handler({});
    expect(result.isError).toBeFalsy();
    const diagnostics = JSON.parse(textOf(result)) as { severity: string; code: string }[];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'parse-error' }),
    );
  });
});

describe('render', () => {
  it('renders the system-context diagram to SVG containing expected markup', async () => {
    const result = await tool(dir, 'render').handler({ slug: 'system-context' });
    expect(result.isError).toBeFalsy();
    const svg = textOf(result);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Architect');
    expect(svg).toContain('Payment Gateway');
  });

  it('reports available diagram slugs as an isError for an unknown slug', async () => {
    const result = await tool(dir, 'render').handler({ slug: 'does-not-exist' });
    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { availableSlugs: string[] };
    expect(body.availableSlugs).toEqual(expect.arrayContaining(['system-context', 'container']));
  });
});

describe('write_layout', () => {
  it('persists a valid layout write, re-parseable by parseLayoutYaml', async () => {
    const content = ['version: 1', 'nodes:', '  architect:', '    x: 100', '    y: 50', 'edges: {}', ''].join(
      '\n',
    );

    const result = await tool(dir, 'write_layout').handler({ path: LAYOUT_PATH, content });
    expect(result.isError).toBeFalsy();

    const written = await readFile(join(dir, LAYOUT_PATH), 'utf8');
    expect(written).toContain('architect');
  });

  it('rejects invalid layout YAML — isError, file untouched', async () => {
    const before = await readFile(join(dir, LAYOUT_PATH), 'utf8');

    const result = await tool(dir, 'write_layout').handler({
      path: LAYOUT_PATH,
      content: 'not: [valid, layout, shape',
    });
    expect(result.isError).toBe(true);

    const after = await readFile(join(dir, LAYOUT_PATH), 'utf8');
    expect(after).toBe(before);
  });

  it('rejects a non-.layout/ path — isError, no write', async () => {
    const result = await tool(dir, 'write_layout').handler({
      path: '.workspec/diagrams/system-context.yaml',
      content: 'version: 1\nnodes: {}\nedges: {}\n',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('.layout/');
  });

  it('rejects a path escaping .workspec/ — isError, no write', async () => {
    const result = await tool(dir, 'write_layout').handler({
      path: 'not-workspec/diagrams/.layout/system-context.yaml',
      content: 'version: 1\nnodes: {}\nedges: {}\n',
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, 'not-workspec/diagrams/.layout/system-context.yaml'), 'utf8')).rejects.toBeTruthy();
  });

  it('rejects a backslash-traversal-shaped path up front, creating no garbage file (issue #52)', async () => {
    // On POSIX, `..\..\x.yaml` is one literal filename — it would pass a
    // naive resolve-based containment check and get written inside root.
    // The ref-shape pre-check (`isWorkspecPath`, built on
    // `isSafeRelativeRef`) rejects it before it reaches `source.writeFile`.
    const badPath = String.raw`..\..\x.yaml`;

    const result = await tool(dir, 'write_layout').handler({
      path: badPath,
      content: 'version: 1\nnodes: {}\nedges: {}\n',
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, badPath), 'utf8')).rejects.toBeTruthy();
  });
});

describe('import_aspire', () => {
  // A fresh, EMPTY tree — not a copy of `dir` (the representative fixture) —
  // since that fixture already has its own hand-authored
  // `.workspec/containers/api-server.yaml`, which would collide with the
  // sample graph's "api-server" resource and get reported as
  // `skipped-conflict` rather than scaffolded. Mirrors `cli.test.ts`'s own
  // `import-aspire` suite, which likewise starts from a bare mkdtemp dir.
  let aspireDir: string;
  beforeEach(async () => {
    aspireDir = await mkdtemp(join(tmpdir(), 'c4-studio-mcp-aspire-'));
  });
  afterEach(async () => {
    await rm(aspireDir, { recursive: true, force: true });
  });

  async function loadGraph(): Promise<unknown> {
    return JSON.parse(await readFile(SAMPLE_GRAPH, 'utf8'));
  }

  it('mode "check" reports read-only diagnostics against a graph the tree hasn\'t scaffolded yet', async () => {
    const graph = await loadGraph();
    const result = await tool(aspireDir, 'import_aspire').handler({ graph, mode: 'check' });
    expect(result.isError).toBeFalsy();
    const diagnostics = JSON.parse(textOf(result)) as { code: string }[];
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'element-missing' }));
    // Read-only: nothing was written under containers/.
    await expect(
      readFile(join(aspireDir, '.workspec/containers/api-server.yaml'), 'utf8'),
    ).rejects.toBeTruthy();
  });

  it('mode "scaffold" writes the projected tree and is idempotent on a second run', async () => {
    const graph = await loadGraph();

    const first = await tool(aspireDir, 'import_aspire').handler({ graph, mode: 'scaffold' });
    expect(first.isError).toBeFalsy();
    const firstReport = JSON.parse(textOf(first)) as { files: { action: string }[] };
    expect(firstReport.files.some((f) => f.action !== 'unchanged')).toBe(true);

    const apiServerText = await readFile(join(aspireDir, '.workspec/containers/api-server.yaml'), 'utf8');
    expect(apiServerText).toContain('aspire-managed');

    const second = await tool(aspireDir, 'import_aspire').handler({ graph, mode: 'scaffold' });
    expect(second.isError).toBeFalsy();
    const secondReport = JSON.parse(textOf(second)) as { files: { action: string }[] };
    expect(secondReport.files.every((f) => f.action === 'unchanged')).toBe(true);
  });

  it('rejects an invalid mode — isError', async () => {
    const graph = await loadGraph();
    const result = await tool(aspireDir, 'import_aspire').handler({ graph, mode: 'bogus' });
    expect(result.isError).toBe(true);
  });

  it('rejects an invalid graph (unsupported version) — isError', async () => {
    const result = await tool(aspireDir, 'import_aspire').handler({
      graph: { version: 'workspec-graph/v9', apphost: { name: 'x' }, resources: [] },
      mode: 'check',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/unsupported graph version/);
  });

  it('confines every scaffold write under .workspec/ for hostile resource/apphost names (containment regression)', async () => {
    // `slugify` (packages/c4-schema/src/paths/slugify.ts) is c4's ONLY
    // containment defense on the scaffold write surface — `createFsSource`
    // does a bare `join(root, path)` with no path backstop of its own. This
    // locks that invariant: every element/system/diagram path scaffold writes
    // is derived from `slugify(resourceName)`/`slugify(apphost.name)`, which
    // collapses every non-`[a-z0-9]` run to `-`, so no `/`, `.`, `\`, `:` or
    // NUL can survive into a path segment. If a future slugify change ever
    // let a `.` or `/` through, this test fails instead of silently
    // re-opening a directory-traversal write escape.
    const hostileGraph = {
      version: 'workspec-graph/v1',
      apphost: { name: '../../evil-apphost' },
      resources: [
        { name: '../../../etc/evil', kind: 'container', typeName: 'ContainerResource' },
        { name: '/etc/passwd', kind: 'container', typeName: 'ContainerResource' },
        { name: String.raw`C:\evil`, kind: 'container', typeName: 'ContainerResource' },
        { name: '!!!@@@###', kind: 'container', typeName: 'ContainerResource' },
      ],
    };

    const result = await tool(aspireDir, 'import_aspire').handler({
      graph: hostileGraph,
      mode: 'scaffold',
    });
    // Scaffold SUCCEEDS — it doesn't reject hostile names, it sanitizes them
    // via slugify; the security property is that the sanitized paths stay
    // contained, not that hostile input is refused.
    expect(result.isError).toBeFalsy();
    const report = JSON.parse(textOf(result)) as { files: { path: string; action: string }[] };

    // Every path the scaffold reported writing is under the `.workspec/` tree.
    expect(report.files.length).toBeGreaterThan(0);
    for (const file of report.files) {
      expect(file.path.startsWith('.workspec/')).toBe(true);
      // Belt-and-braces: no traversal or absolute/drive/backslash shape survived
      // into the path scaffold actually wrote to.
      expect(file.path).not.toContain('..');
      expect(file.path).not.toContain('\\');
      expect(file.path).not.toMatch(/^[A-Za-z]:/);
      expect(file.path.startsWith('/')).toBe(false);
    }

    // And on disk: nothing was created at or above the served root — the only
    // top-level entry is `.workspec/` (no `etc`, `evil-apphost`, `C:` etc.).
    expect(await readdir(aspireDir)).toEqual(['.workspec']);
  });
});
