// The `serve` subcommand's HTTP server. A thin Express app over a
// `C4FileSource` (the same four-method port `@workspec/c4-model`'s loader
// consumes) plus static serving of the built Vite client. There is no
// per-artifact-kind API the way `@workspec/decision-studio`'s server has one
// (decisions/catalogs): `@workspec/c4-model`'s repository port is already the
// generic `C4FileSource`, so this proxies THAT port over HTTP directly, plus
// one convenience endpoint (`GET /api/model`) that runs the full loader
// server-side so the browser gets one fetch instead of N round trips to
// reconstruct a model itself.
//
// Least privilege on BOTH directions of the file proxy. Reads (`/api/files`,
// `/api/file`, `/api/file-exists`) are confined to `.workspec/**` — the
// client only ever requests `.workspec/` paths, so serving anything else
// (`.git/`, `.env`, source files) would be needless surface. Raw-file
// writes (`PUT /api/file`) are further restricted to `.layout/` files
// (drag-to-pin) and Zod-validated (reusing `@workspec/c4-schema`'s `Layout`
// schema, via `parseLayoutYaml`) before they reach the working tree — a
// malformed PUT is rejected, never written. Element/diagram mutations go
// through the dedicated write API instead (`mutations/mutation-router.ts`,
// issue #132): zod-gated JSON routes that accept slugs and kind enums only
// (never paths) and validate every result against its artifact schema
// before writing. Paths are repo-root-relative POSIX paths; traversal
// outside the served directory is refused.
//
// Two cross-cutting protections are wired HERE rather than per route,
// because both are properties of the served TREE, not of any one router:
//
//   • `createHostHeaderGuard` on the whole `/api` surface — the
//     DNS-rebinding backstop. It covers reads as well as writes: a
//     rebinding page reading `GET /api/file` exfiltrates a developer's
//     `.workspec/` tree, and `PUT /api/file` is a write route that an
//     earlier mutation-router-only mounting left wide open (a hostile Host
//     got a confirmed 204 layout clobber).
//   • `createMutationQueue` — ONE FIFO per served tree, shared by the
//     mutation router AND `PUT /api/file`. Both write `.layout/` files
//     (`scrubLayoutRefs`/`upsertLayoutPin` vs drag-to-pin), so a queue that
//     covered only one of them still lost updates on the other.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { loadC4Model } from '@workspec/c4-model';
import { createFsSource, RefEscapesRootError } from '@workspec/c4-model/fs';
import { isLayoutFile, parseLayoutYaml, serializeLayout } from '@workspec/c4-schema';
import { assembleMcpServer, mountMcpHttp } from '@workspec/mcp-core';
import type { McpToolProvider } from '@workspec/mcp-core';
import { modelToWire } from './model-to-wire.js';
import { createHostHeaderGuard } from './mutations/host-header-guard.js';
import { createMutationQueue } from './mutations/mutation-queue.js';
import type { MutationQueue } from './mutations/mutation-queue.js';
import { buildMutationRouter } from './mutations/mutation-router.js';
import { createTreeIo } from './mutations/tree-io.js';
import { isWorkspecPath } from './workspec-path.js';

/** Options for {@link createServer}. */
export interface CreateServerOptions {
  /** Directory containing `.workspec/` to serve. */
  dir: string;
  /**
   * Directory of the built Vite client to serve at `/`. Defaults to the
   * package's `dist/client` (present after `pnpm build`). When absent, the
   * API is still served and `/` returns a short hint.
   */
  clientDir?: string;
  /**
   * When present, mounts an MCP server (`@workspec/mcp-core`'s
   * `mountMcpHttp`, stateless, at `/mcp`) alongside the JSON API. Absent by
   * default — most callers (tests, the client dev server) don't need it.
   */
  mcpProvider?: McpToolProvider;
  /**
   * The address `serve.ts` binds (`--host <addr>`). Added to the Host-header
   * guard's allowlist so a documented non-loopback bind still authors —
   * without it, `--host 192.168.1.5` served a page that loaded fine and then
   * 403'd every write. Absent (the default) means loopback only.
   */
  bindHost?: string;
  /**
   * The served tree's write queue. Injectable so a caller that ALSO writes
   * the tree in-process (`serve --mcp`, whose `c4_write_layout` tool writes
   * the same `.layout/` files) can share this exact instance. Defaults to a
   * fresh per-server queue, which is correct for every other caller.
   */
  writeQueue?: MutationQueue;
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** Locate the built client: alongside this module (dist/) or under ../dist (src/). */
function defaultClientDir(): string | undefined {
  for (const candidate of [join(HERE, 'client'), join(HERE, '..', 'dist', 'client')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

/**
 * Reject paths that are absolute, escape the served directory, or fall
 * outside `.workspec/**`. The whole file-proxy API exists to serve the
 * `.workspec/` tree to the explorer client — nothing under the served root's
 * other directories (`.git/`, `.env`, source files) is ever a legitimate
 * request, so it's refused at the parameter gate, not per route. Delegates
 * the actual shape+confinement check to `isWorkspecPath` (shared with the
 * `c4` MCP tools' `write_layout`), so this and the MCP surface can never
 * drift on what "confined to `.workspec/`" means.
 */
function pathParam(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return isWorkspecPath(raw) ? raw : undefined;
}

/**
 * Maps a rejected path (one that escaped the served root, per
 * `createFsSource`'s internal `resolveRef` — see `RefEscapesRootError`'s doc
 * comment) to a 400, mirroring `@workspec/decision-studio`'s
 * `sendIfRefEscapes`. Returns whether it handled the error, so callers can
 * fall through to their own mapping otherwise.
 *
 * Coverage differs by route. The four file-proxy routes (`/api/files`,
 * `/api/file` GET/PUT, `/api/file-exists`) are pre-gated by `pathParam`'s
 * `isWorkspecPath` check, so an escaping path is normally rejected with a
 * 400 before `source` ever sees it — this mapping is a backstop there, not
 * the primary defence. `/api/model` is NOT pre-gated the same way: it hands
 * `source` straight to `loadC4Model`, which walks the whole `.workspec/`
 * tree and, per element, calls `source.exists()` on content-derived `~/`
 * link targets (`checkDanglingLinks`) that are schema-valid but not
 * shape-restricted (e.g. `~/../escape.md`). That path is NOT a throw,
 * though: `FsSource.exists` (see its own doc comment) reports an escaping
 * path as `false` rather than throwing `RefEscapesRootError`, precisely so
 * an authored link a client doesn't control can't 400 the whole model load.
 * So in today's code, nothing reachable from `/api/model` actually throws
 * `RefEscapesRootError` — this classification exists as a stable mapping
 * for that error type wherever it's thrown, present and future, not because
 * `/api/model` currently produces one.
 */
function sendIfRefEscapes(res: Response, error: unknown): boolean {
  if (error instanceof RefEscapesRootError) {
    res.status(400).json({ error: 'path escapes served root' });
    return true;
  }
  return false;
}

/**
 * Logs the real error server-side and sends a generic, non-leaky 500 body.
 * This is the fallback for every error that isn't a typed case (here, the
 * 404 for not-found and the 400 for an escaping path): an unclassified
 * filesystem error's `.message` can carry the served root's absolute path
 * (e.g. `EISDIR` when a path of `.workspec` resolves to that directory
 * itself), so it must never reach the client — only the server log.
 */
function sendInternalError(res: Response, error: unknown, ref?: string): void {
  if (sendIfRefEscapes(res, error)) return;
  // `ref` is client-supplied, so it must not flow into console.error's
  // format-string argument (tainted format string / log injection); pass it
  // as a separate argument instead.
  if (ref !== undefined) {
    console.error('[c4-studio] unhandled error, ref:', ref, error);
  } else {
    console.error('[c4-studio] unhandled error:', error);
  }
  res.status(500).json({ error: 'internal error' });
}

function sendIoError(res: Response, error: unknown, ref?: string): void {
  if (sendIfRefEscapes(res, error)) return;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') {
    res.status(404).json({ error: 'not found' });
    return;
  }
  sendInternalError(res, error, ref);
}

/**
 * Build the Express app serving `dir`. Exported (not just booted) so tests
 * can drive it with supertest without binding a socket.
 */
export function createServer(options: CreateServerOptions): Express {
  const root = resolve(options.dir);
  const source = createFsSource(root);
  const app = express();

  // Rate limit every route (API reads/writes and the static/SPA file sinks).
  // This host binds localhost by default and serves a single user, so the cap
  // is deliberately generous — it never trips in normal use or the smoke test
  // — but it bounds abuse if the host is ever bound to a public interface.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.use(express.json({ limit: '4mb' }));

  // DNS-rebinding backstop across the ENTIRE JSON API — reads included (see
  // this module's header). Mounted before every `/api` route so no route can
  // be added later that forgets it. The static client and `/mcp` are
  // deliberately out of scope: the former is public bundle code, and
  // `mountMcpHttp` runs its own equivalent host/origin pre-check.
  const hostGuard = createHostHeaderGuard(options.bindHost !== undefined ? [options.bindHost] : []);
  app.use('/api', hostGuard);

  // ONE write queue per served tree, shared by `PUT /api/file` below and the
  // mutation router — they write the same `.layout/` files.
  const writeQueue = options.writeQueue ?? createMutationQueue();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dir: root });
  });

  app.get('/api/model', (_req, res) => {
    loadC4Model(source)
      .then((model) => res.json(modelToWire(model)))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/files', (req, res) => {
    const dir = pathParam(req, 'dir');
    if (dir === undefined) {
      res.status(400).json({ error: 'missing or invalid dir' });
      return;
    }
    source
      .listFiles(dir)
      .then((files) => res.json(files))
      .catch((error: unknown) => sendInternalError(res, error, dir));
  });

  app.get('/api/file', (req, res) => {
    const path = pathParam(req, 'path');
    if (path === undefined) {
      res.status(400).json({ error: 'missing or invalid path' });
      return;
    }
    source
      .readFile(path)
      .then((content) => res.json({ content }))
      .catch((error: unknown) => sendIoError(res, error, path));
  });

  app.get('/api/file-exists', (req, res) => {
    const path = pathParam(req, 'path');
    if (path === undefined) {
      res.status(400).json({ error: 'missing or invalid path' });
      return;
    }
    source
      .exists(path)
      .then((exists) => res.json({ exists }))
      .catch((error: unknown) => sendInternalError(res, error, path));
  });

  app.put('/api/file', (req, res) => {
    const path = pathParam(req, 'path');
    if (path === undefined) {
      res.status(400).json({ error: 'missing or invalid path' });
      return;
    }
    // Least privilege: the only write path any @workspec/c4-ui component ever
    // exercises is the drag-to-pin `.layout/` write — refuse everything else.
    if (!isLayoutFile(path)) {
      res.status(400).json({ error: 'writes are only permitted for .layout/ files' });
      return;
    }
    const content = req.body as unknown;
    const text =
      typeof content === 'object' && content !== null
        ? (content as { content?: unknown }).content
        : undefined;
    if (typeof text !== 'string') {
      res.status(400).json({ error: 'missing "content" string in body' });
      return;
    }
    const parsed = parseLayoutYaml(text);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid layout', issues: parsed.errors });
      return;
    }
    // Through the shared queue: `removeDiagramNode`→`scrubLayoutRefs` and
    // `createElement`→`upsertLayoutPin` read-modify-write this same file, and
    // the client's drag-to-pin body is a FULL-file merge computed from the
    // last model fetch — so an unqueued PUT racing a mutation either
    // resurrects a scrubbed pin or silently loses the drag.
    writeQueue(() => source.writeFile(path, serializeLayout(parsed.data)))
      .then(() => res.status(204).end())
      .catch((error: unknown) => sendInternalError(res, error, path));
  });

  // The element/relation write API (issue #132): zod-gated JSON mutations
  // over the same `source`, plus a root-confined `TreeIo` for the one
  // operation the `C4FileSource` port cannot express (element deletion).
  // Clients supply slugs and kind enums only — never paths — see
  // `mutations/mutation-router.ts` for the route table and containment story.
  app.use(
    '/api',
    buildMutationRouter({ source, treeIo: createTreeIo(root), queue: writeQueue, hostGuard }),
  );

  // Mounted before the static/SPA fallback below — that fallback's catch-all
  // GET (`/^(?!\/api\/).*/`) would otherwise swallow `/mcp` before this
  // route ever saw the request.
  if (options.mcpProvider !== undefined) {
    mountMcpHttp(app, assembleMcpServer([options.mcpProvider]));
  }

  // Static client + SPA fallback (only for non-API GETs).
  const clientDir = options.clientDir ?? defaultClientDir();
  if (clientDir !== undefined) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send('C4 Studio API is running. Build the client (pnpm build) to serve the UI.');
    });
  }

  return app;
}
