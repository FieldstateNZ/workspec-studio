// A tiny static server for the smoke test. It serves the built host at `/`,
// the decision-ui remote at `/remote/`, the c4-ui remote at `/remote-c4/`,
// the cost-ui remote at `/remote-cost/`, and the topology-ui remote at
// `/remote-topology/`, all from ONE origin — so the host's
// `/remote/remoteEntry.js` / `/remote-c4/remoteEntry.js` /
// `/remote-cost/remoteEntry.js` / `/remote-topology/remoteEntry.js`
// references and each remote's `publicPath: 'auto'` chunk loading all
// resolve without any cross-origin or port coordination. Deliberately
// dependency-free (Node built-ins only).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const HOST_DIST = resolve(here, 'dist');
const REMOTE_DIST = resolve(here, '../../packages/decision-ui/dist-mf');
const C4_REMOTE_DIST = resolve(here, '../../packages/c4-ui/dist-mf');
const COST_REMOTE_DIST = resolve(here, '../../packages/cost-ui/dist-mf');
const TOPOLOGY_REMOTE_DIST = resolve(here, '../../packages/topology-ui/dist-mf');
const PORT = Number(process.env.PORT ?? 4390);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.yaml': 'text/yaml; charset=utf-8',
};

async function readIfFile(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (info.isDirectory()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Route `/remote/*` to the decision-ui remote, `/remote-c4/*` to the
    // c4-ui remote, `/remote-cost/*` to the cost-ui remote, `/remote-topology/*`
    // to the topology-ui remote; everything else to the host. The three
    // longer, more specific prefixes are checked first — they would
    // otherwise also match the plain `/remote` prefix check.
    let baseDir = HOST_DIST;
    if (pathname === '/remote-c4' || pathname.startsWith('/remote-c4/')) {
      baseDir = C4_REMOTE_DIST;
      pathname = pathname.slice('/remote-c4'.length) || '/';
    } else if (pathname === '/remote-cost' || pathname.startsWith('/remote-cost/')) {
      baseDir = COST_REMOTE_DIST;
      pathname = pathname.slice('/remote-cost'.length) || '/';
    } else if (pathname === '/remote-topology' || pathname.startsWith('/remote-topology/')) {
      baseDir = TOPOLOGY_REMOTE_DIST;
      pathname = pathname.slice('/remote-topology'.length) || '/';
    } else if (pathname === '/remote' || pathname.startsWith('/remote/')) {
      baseDir = REMOTE_DIST;
      pathname = pathname.slice('/remote'.length) || '/';
    }

    // Resolve within baseDir; reject anything that escapes it (path traversal).
    const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    let filePath = resolve(baseDir, `.${requested}`);
    if (filePath !== baseDir && !filePath.startsWith(`${baseDir}/`)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    let body = await readIfFile(filePath);
    // SPA fallback (host origin only): unknown extensionless routes → index.html.
    if (body === null && baseDir === HOST_DIST && extname(filePath) === '') {
      filePath = join(HOST_DIST, 'index.html');
      body = await readIfFile(filePath);
    }
    if (body === null) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  })().catch((error: unknown) => {
    res.statusCode = 500;
    res.end(`Server error: ${String(error)}`);
  });
});

server.listen(PORT, () => {
  console.log(`[mf-host] smoke server on http://localhost:${PORT} (remote under /remote)`);
});
