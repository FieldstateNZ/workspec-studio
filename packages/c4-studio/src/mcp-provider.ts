// The `c4` MCP provider — the surface an MCP client/agent gets over a
// served `.workspec/` tree. STRUCTURALLY DIFFERENT from
// `@workspec/decision-studio`'s and `@workspec/cost-studio`'s providers:
// those wrap an artifact-repository read/write-PAIR shape (one read + one
// write tool per artifact kind). `@workspec/c4-model`'s port
// (`C4FileSource`) is already generic, and this package's own value-add
// over it is the loader/renderer/aspire-importer — so the five tools here
// mirror the CLI's own subcommands (`validate`, `render`, `import-aspire`)
// plus the loader (`get_model`) and the one write path any
// `@workspec/c4-ui` component exercises (`write_layout`), not a
// list/read/write triple per element kind.

import type { C4FileSource } from '@workspec/c4-model';
import type { McpToolProvider } from '@workspec/mcp-core';
import { createMutationQueue } from './mutations/mutation-queue.js';
import type { MutationQueue } from './mutations/mutation-queue.js';
import { buildGetModelTool } from './mcp-tools/get-model-tool.js';
import { buildImportAspireTool } from './mcp-tools/import-aspire-tool.js';
import { buildRenderTool } from './mcp-tools/render-tool.js';
import { buildValidateTool } from './mcp-tools/validate-tool.js';
import { buildWriteLayoutTool } from './mcp-tools/write-layout-tool.js';

/**
 * Builds the `c4` MCP provider over `source`. Mount it with
 * `@workspec/mcp-core`'s `assembleMcpServer`:
 *
 * ```ts
 * const server = assembleMcpServer([createC4McpProvider(createFsSource(dir))]);
 * ```
 *
 * Every tool is then advertised under `c4_<name>` (e.g. `c4_get_model`).
 *
 * Takes an already-built `C4FileSource` rather than a raw directory —
 * mirroring `@workspec/cost-studio`'s `createCostMcpProvider(repo:
 * FsRepository)` and `@workspec/decision-studio`'s equivalent, both of
 * which accept the pre-built data-access abstraction rather than resolving
 * a directory internally. This keeps the provider injectable: tests can
 * pass `@workspec/c4-model`'s in-memory `createMemorySource` for the
 * write/import tools without touching a real filesystem (as
 * `aspire/scaffold.test.ts` already does for the non-MCP scaffold/check
 * functions), while callers that want the real tree still only need one
 * extra line — `createFsSource(dir)` — at the call site (`run-mcp.ts`,
 * `serve.ts`), exactly where `server.ts` already resolves `dir` and builds
 * its own `source` today.
 *
 * `writeQueue` exists for exactly one caller: `serve --mcp`, where this
 * provider and the HTTP API run in ONE process over ONE tree and both write
 * `.layout/` files. Passing the server's queue makes `write_layout`
 * serialize against drag-to-pin and against every element/relation mutation
 * that scrubs a pin. The default (a fresh queue) is right for `run-mcp.ts`,
 * which is a standalone process — cross-PROCESS serialization would need a
 * file lock and is deliberately not attempted here.
 */
export function createC4McpProvider(
  source: C4FileSource,
  writeQueue: MutationQueue = createMutationQueue(),
): McpToolProvider {
  return {
    namespace: 'c4',
    tools: [
      buildGetModelTool(source),
      buildValidateTool(source),
      buildRenderTool(source),
      buildImportAspireTool(source),
      buildWriteLayoutTool(source, writeQueue),
    ],
  };
}
