import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';
import type { McpToolDef } from '@workspec/mcp-core';
import { readStringArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      description: 'Which decision to render — its ref (e.g. ".workspec/decisions/hosting-platform.yaml") or its slug.',
    },
  },
  required: ['decision'],
  additionalProperties: false,
};

/**
 * Builds the `render_adr` tool: resolve a decision (by ref or id), read it
 * and its catalog, then render the same deterministic Markdown ADR the CLI's
 * `render-adr` command produces.
 */
export function buildRenderAdrTool(repo: FsRepository): McpToolDef {
  return {
    name: 'render_adr',
    description:
      'Render a decision (by ref or slug) to a deterministic Markdown ADR, resolving its catalog and computing costs.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      const wanted = readStringArg(args, 'decision');
      // The whole body is guarded — including the `listDecisions()` that sits
      // ahead of the read/render below — so a raw fs error from any of them is
      // scrubbed rather than leaked (defense-in-depth for the discovery call,
      // authoritative for the read/render calls).
      try {
        const decisions = await repo.listDecisions();
        const found = decisions.find((d) => d.ref === wanted || d.slug === wanted);
        if (found === undefined) {
          return {
            content: [{ type: 'text', text: `no decision matching "${wanted}"` }],
            isError: true,
          };
        }
        const decision = await repo.readDecision(found.ref);
        const catalogRef = repo.resolveCatalogRef(found.ref, decision);
        const catalog = await repo.readCatalog(catalogRef);
        // Mirror the CLI's `render-adr`: fall back to the caller-supplied
        // identifier when the artifact carries no explicit `metadata.slug`.
        const markdown = renderAdrMarkdown(buildAdrModel(decision, catalog, found.slug ?? wanted));
        return { content: [{ type: 'text', text: markdown }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
