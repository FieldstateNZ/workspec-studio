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
// (`.git/`, `.env`, source files) would be needless surface. Writes are
// further restricted to `.layout/` files (drag-to-pin is the only write path
// `@workspec/c4-ui`'s components ever exercise) and Zod-validated (reusing
// `@workspec/c4-schema`'s `Layout` schema, via `parseLayoutYaml`) before
// they reach the working tree — a malformed PUT is rejected, never written.
// Paths are repo-root-relative POSIX paths; traversal outside the served
// directory is refused.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { C4Model } from '@workspec/c4-model';
import { loadC4Model } from '@workspec/c4-model';
import { createFsSource } from '@workspec/c4-model/fs';
import { isLayoutFile, parseLayoutYaml, serializeLayout, WORKSPEC_DIR } from '@workspec/c4-schema';

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
 * request, so it's refused at the parameter gate, not per route.
 */
function pathParam(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (raw.startsWith('/') || raw.includes('..') || raw.includes('\0')) return undefined;
  if (raw !== WORKSPEC_DIR && !raw.startsWith(`${WORKSPEC_DIR}/`)) return undefined;
  return raw;
}

/** `C4Model.elements` is `Record<kind, ReadonlyMap<slug, LoadedElement>>` — not JSON-serialisable as-is. */
function modelToWire(model: C4Model): unknown {
  return {
    elements: Object.fromEntries(
      Object.entries(model.elements).map(([kind, bySlug]) => [kind, Object.fromEntries(bySlug)]),
    ),
    diagrams: model.diagrams,
    spec: model.spec,
    diagnostics: model.diagnostics,
  };
}

/**
 * Logs the real error server-side and sends a generic, non-leaky 500 body.
 * This is the fallback for every error that isn't a typed case (here, the
 * 404 for not-found): an unclassified filesystem error's `.message` can
 * carry the served root's absolute path (e.g. `EISDIR` when a path of
 * `.workspec` resolves to that directory itself), so it must never reach the
 * client — only the server log.
 */
function sendInternalError(res: Response, error: unknown, ref?: string): void {
  console.error(
    `[c4-studio] unhandled error${ref !== undefined ? ` (ref: ${ref})` : ''}:`,
    error,
  );
  res.status(500).json({ error: 'internal error' });
}

function sendIoError(res: Response, error: unknown, ref?: string): void {
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
    source
      .writeFile(path, serializeLayout(parsed.data))
      .then(() => res.status(204).end())
      .catch((error: unknown) => sendInternalError(res, error, path));
  });

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
