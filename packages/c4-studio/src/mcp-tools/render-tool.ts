import type { C4FileSource } from '@workspec/c4-model';
import { loadC4Model } from '@workspec/c4-model';
import type { ThemeName } from '@workspec/c4-ui';
import type { McpToolDef } from '@workspec/mcp-core';
import { readStringArg } from '@workspec/mcp-core';
import { renderDiagramToSvg } from '../render-diagram.js';
import { mapC4ErrorToResult } from './map-c4-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Diagram slug to render, e.g. "system-context".' },
    theme: {
      type: 'string',
      enum: ['light', 'dark'],
      description: 'Theme to resolve into the SVG (default: "light").',
    },
  },
  required: ['slug'],
  additionalProperties: false,
};

/**
 * Reads the optional `theme` arg. Not `@workspec/mcp-core`'s generic
 * `readStringArg` (which only checks "is it a string") — `theme` is a
 * closed two-value enum, same as the CLI's own `--theme` flag validation in
 * `cli.ts`'s `runRender`, so this additionally rejects any string that
 * isn't `"light"` or `"dark"`.
 */
function readOptionalTheme(args: unknown): ThemeName | undefined {
  if (typeof args !== 'object' || args === null || !('theme' in args)) return undefined;
  const value = (args as Record<string, unknown>).theme;
  if (value === undefined) return undefined;
  if (value !== 'light' && value !== 'dark') {
    throw new Error('argument "theme" must be "light" or "dark"');
  }
  return value;
}

/**
 * Builds the `render` tool: lays out and renders one diagram to a
 * standalone SVG string via `renderDiagramToSvg` — the same function the
 * CLI's `render` command uses. Mirrors the CLI's own "no diagram found"
 * handling on an unknown slug: an `isError` result listing the tree's
 * available diagram slugs, rather than a bare failure.
 */
export function buildRenderTool(source: C4FileSource): McpToolDef {
  return {
    name: 'render',
    description: 'Render one diagram under the served directory to a standalone SVG string, by slug.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let slug: string;
      let theme: ThemeName | undefined;
      try {
        slug = readStringArg(args, 'slug');
        theme = readOptionalTheme(args);
      } catch (error) {
        return mapC4ErrorToResult(error);
      }

      try {
        const model = await loadC4Model(source);
        const result = await renderDiagramToSvg(model, slug, theme !== undefined ? { theme } : {});
        if (!result.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `no diagram "${slug}" found`,
                  availableSlugs: result.availableSlugs,
                }),
              },
            ],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: result.svg }] };
      } catch (error) {
        return mapC4ErrorToResult(error);
      }
    },
  };
}
