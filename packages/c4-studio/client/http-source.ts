// The browser-side `C4FileSource`: the same four-method port
// `@workspec/c4-model`'s loader consumes, backed by the host server's generic
// file-proxy API instead of `node:fs`. `@workspec/c4-ui` components only ever
// call `writeFile` on this (the drag-to-pin path — see `C4Diagram`'s
// `writeLayout`); `listFiles`/`readFile`/`exists` are implemented for
// completeness and testability, not because any shipped component calls them
// today.
import type { C4FileSource } from '@workspec/c4-model';

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

export function createHttpSource(base = ''): C4FileSource {
  return {
    async listFiles(dirPath) {
      const res = await fetch(`${base}/api/files?dir=${encodeURIComponent(dirPath)}`);
      if (!res.ok) await fail(res);
      return (await res.json()) as string[];
    },
    async readFile(path) {
      const res = await fetch(`${base}/api/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) await fail(res);
      const body = (await res.json()) as { content: string };
      return body.content;
    },
    async writeFile(path, content) {
      const res = await fetch(`${base}/api/file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) await fail(res);
    },
    async exists(path) {
      const res = await fetch(`${base}/api/file-exists?path=${encodeURIComponent(path)}`);
      if (!res.ok) await fail(res);
      const body = (await res.json()) as { exists: boolean };
      return body.exists;
    },
  };
}
