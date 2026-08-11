import { layoutPathFor, serializeLayout } from '@workspec/c4-schema';
import type { MutationApi } from './mutation-api.types.js';

/**
 * Extracts the server's diagnostic from a failed response — the `{ error }`
 * body every route sends, falling back to the HTTP status text — and
 * throws it. Same pattern as the existing `http-source.ts` `fail`, so
 * every write path surfaces identical, banner-ready messages.
 */
async function fail(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error !== undefined) detail = body.error;
  } catch {
    /* non-JSON body */
  }
  throw new Error(`${String(response.status)} ${detail}`);
}

/**
 * Fetch-backed {@link MutationApi} against the host server's write routes.
 * `base` is prepended to every URL (default same-origin, matching
 * `createHttpSource`). One tiny JSON helper backs all six mutation
 * methods; `clearLayout` alone rides the pre-existing `PUT /api/file`
 * route because "no pins" is a layout write, not an element/relation
 * mutation.
 */
export function createMutationApi(base = ''): MutationApi {
  async function requestJson<T>(method: string, path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await fail(res);
    return (await res.json()) as T;
  }

  return {
    createElement: (input) => requestJson('POST', '/api/elements', input),
    updateElement: (input) => requestJson('PATCH', '/api/elements', input),
    deleteElement: (input) => requestJson('DELETE', '/api/elements', input),
    removeDiagramNode: (input) => requestJson('DELETE', '/api/diagram-nodes', input),
    createRelation: (input) => requestJson('POST', '/api/relations', input),
    renameRelation: (input) => requestJson('PATCH', '/api/relations', input),
    deleteRelation: (input) => requestJson('DELETE', '/api/relations', input),
    async clearLayout(diagramSlug) {
      const path = layoutPathFor(diagramSlug);
      const content = serializeLayout({ version: 1, nodes: {} });
      const res = await fetch(`${base}/api/file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) await fail(res);
    },
  };
}
