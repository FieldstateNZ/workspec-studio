// The browser-side `TopologyFileSource`: the same four-method port
// `@workspec/topology-model`'s `loadTopologyModel` (and, later, drag-to-pin
// layout writes) reads through, but backed by the Express host's
// `/api/tree/*` routes instead of `node:fs`. Client → HTTP → Express →
// `FsRepository.createFileSource()` → working tree. Mirrors
// `@workspec/decision-studio`'s `HttpRepository`, adapted to
// `@workspec/topology-model`'s whole-tree-source port rather than a
// per-artifact CRUD port.
//
// `writeFile` is not wired to a route: this authored-only slice always grants
// `capabilities.editLayout: false` (see `main.tsx`), so `@workspec/topology-ui`
// never calls it. It throws rather than silently no-op-ing, so a future
// increment that flips `editLayout: true` without also adding the write route
// fails loudly instead of pretending to save.

import type { TopologyFileSource } from '@workspec/topology-model';

async function fail(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error !== undefined) detail = body.error;
  } catch {
    /* non-JSON body */
  }
  throw new Error(`${response.status} ${detail}`);
}

/** A `TopologyFileSource` implemented over the studio host's `/api/tree/*` JSON API. */
export class HttpFileSource implements TopologyFileSource {
  constructor(private readonly base = '') {}

  async listFiles(dirPath: string): Promise<readonly string[]> {
    const response = await fetch(`${this.base}/api/tree/list?dir=${encodeURIComponent(dirPath)}`);
    if (!response.ok) await fail(response);
    return (await response.json()) as string[];
  }

  async readFile(path: string): Promise<string> {
    const response = await fetch(`${this.base}/api/tree/read?path=${encodeURIComponent(path)}`);
    if (!response.ok) await fail(response);
    return response.text();
  }

  writeFile(): Promise<void> {
    return Promise.reject(new Error('HttpFileSource is read-only (capabilities.editLayout is always false)'));
  }

  async exists(path: string): Promise<boolean> {
    const response = await fetch(`${this.base}/api/tree/exists?path=${encodeURIComponent(path)}`);
    if (!response.ok) await fail(response);
    const body = (await response.json()) as { exists: boolean };
    return body.exists;
  }
}
