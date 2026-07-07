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
import { ArtifactValidationError, FsRepository } from './fs-repository.js';

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

/** Reject refs that are absolute or escape the served directory. */
function refFrom(req: Request): string | undefined {
  const raw = req.query.ref;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (raw.startsWith('/') || raw.includes('..') || raw.includes('\0')) return undefined;
  return raw;
}

function sendReadError(res: Response, error: unknown): void {
  if (error instanceof ArtifactValidationError) {
    res.status(422).json({ error: 'invalid artifact', ref: error.ref, issues: error.issues });
    return;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
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
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
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
      .catch((error: unknown) => sendReadError(res, error));
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
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  app.get('/api/catalogs', (_req, res) => {
    repo
      .listCatalogs()
      .then((list) => res.json(list))
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
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
      .catch((error: unknown) => sendReadError(res, error));
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
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
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
