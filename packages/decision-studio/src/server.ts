// The localhost host shell's HTTP server. A thin Express app over `FsRepository`:
// list / read / write decisions and catalogs, plus static serving of the built
// Vite client. Writes are Zod-validated (reusing the schema) before they reach
// the repository, so a malformed PUT is rejected with located issues, never
// written. Refs are repo-root-relative POSIX paths; traversal outside the served
// directory is refused.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { CatalogArtifact, DecisionArtifact } from '@workspec/decision-schema';
import { ArtifactValidationError, FsRepository, RefEscapesRootError } from './fs-repository.js';

/** Options for {@link createServer}. */
export interface CreateServerOptions {
  /** Directory of `*.decision.yaml` / `*.catalog.yaml` artifacts to serve. */
  dir: string;
  /**
   * Directory of the built Vite client to serve at `/`. Defaults to the
   * package's `dist/client` (present after `pnpm build`). When absent, the API
   * is still served and `/` returns a short hint.
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

/** Matches a Windows drive-letter prefix (`C:\`, `C:/`, or bare `C:`). */
const DRIVE_LETTER_PATTERN = /^[A-Za-z]:/;

/**
 * Reject refs that are absolute or escape the served directory. This is the
 * first line of defence, checked against the raw ref shape; it deliberately
 * also rejects backslashes and drive-letter prefixes even though this
 * process may be running on POSIX right now — a ref is only ever a
 * repo-root-relative POSIX path by contract, so neither shape is ever
 * legitimate. It is not the authoritative check: `FsRepository.resolve()`
 * (via `resolveWithinRoot`) re-verifies containment regardless of what
 * reaches it here.
 */
function refFrom(req: Request): string | undefined {
  const raw = req.query.ref;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (
    raw.startsWith('/') ||
    raw.includes('..') ||
    raw.includes('\0') ||
    raw.includes('\\') ||
    DRIVE_LETTER_PATTERN.test(raw)
  ) {
    return undefined;
  }
  return raw;
}

/**
 * Maps a rejected ref (one that escaped the served root, per
 * `FsRepository.resolve()`) to a 400. Returns whether it handled the error,
 * so callers can fall through to their own mapping otherwise.
 */
function sendIfRefEscapes(res: Response, error: unknown): boolean {
  if (error instanceof RefEscapesRootError) {
    res.status(400).json({ error: 'ref escapes served root' });
    return true;
  }
  return false;
}

/**
 * Logs the real error server-side and sends a generic, non-leaky 500 body.
 * This is the fallback for every error that isn't one of the typed cases
 * above (ref-escape, validation, not-found): an unclassified filesystem
 * error's `.message` can carry the served root's absolute path (e.g.
 * `EISDIR` when a ref of `.` resolves to the root directory itself), so it
 * must never reach the client — only the server log.
 */
function sendInternalError(res: Response, error: unknown, ref?: string): void {
  console.error(
    `[decision-studio] unhandled error${ref !== undefined ? ` (ref: ${ref})` : ''}:`,
    error,
  );
  res.status(500).json({ error: 'internal error' });
}

function sendReadError(res: Response, error: unknown, ref?: string): void {
  if (sendIfRefEscapes(res, error)) return;
  if (error instanceof ArtifactValidationError) {
    res.status(422).json({ error: 'invalid artifact', ref: error.ref, issues: error.issues });
    return;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') {
    res.status(404).json({ error: 'not found' });
    return;
  }
  sendInternalError(res, error, ref);
}

/**
 * Build the Express app serving `dir`. Exported (not just booted) so tests can
 * drive it with supertest without binding a socket.
 */
export function createServer(options: CreateServerOptions): Express {
  const repo = new FsRepository(resolve(options.dir));
  const app = express();

  // Rate limit every route (API reads/writes and the static/SPA file sinks).
  // This host binds localhost by default and serves a single user, so the cap is
  // deliberately generous — it never trips in normal use, the E2E, or the smoke
  // test — but it bounds abuse if the host is ever bound to a public interface.
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
    res.json({ ok: true, dir: repo.root });
  });

  app.get('/api/decisions', (_req, res) => {
    repo
      .listDecisions()
      .then((list) => res.json(list))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/decision', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readDecision(ref)
      .then((decision) => res.json(decision))
      .catch((error: unknown) => sendReadError(res, error, ref));
  });

  app.put('/api/decision', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = DecisionArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid decision',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeDecision(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => {
        if (sendIfRefEscapes(res, error)) return;
        sendInternalError(res, error, ref);
      });
  });

  app.get('/api/catalogs', (_req, res) => {
    repo
      .listCatalogs()
      .then((list) => res.json(list))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/catalog', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readCatalog(ref)
      .then((catalog) => res.json(catalog))
      .catch((error: unknown) => sendReadError(res, error, ref));
  });

  app.put('/api/catalog', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = CatalogArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid catalog',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeCatalog(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => {
        if (sendIfRefEscapes(res, error)) return;
        sendInternalError(res, error, ref);
      });
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
        .send('Decision Studio API is running. Build the client (pnpm build) to serve the UI.');
    });
  }

  return app;
}
