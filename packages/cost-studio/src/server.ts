// The localhost host shell's HTTP server. A thin Express app over
// `FsRepository`: list / read / write for all four cost artifact kinds
// (inventory, spend, attribution, tag plan), plus static serving of the
// built Vite client. Writes are Zod-validated (reusing the schema) before
// they reach the repository, so a malformed PUT is rejected with located
// issues, never written. Refs are repo-root-relative POSIX paths; traversal
// outside the served directory is refused. Mirrors
// `@workspec/decision-studio`'s `server.ts` shape, scaled to four kinds
// instead of two, with one deliberate divergence: validation failures (both
// a bad PUT body and a bad on-disk file read) both surface as 422, not
// decision-studio's 400-for-PUT/422-for-read split — one status for "this
// artifact does not conform to its schema" regardless of which side of the
// wire it came from.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AttributionArtifact,
  InventoryArtifact,
  SpendArtifact,
  TagPlanArtifact,
} from '@workspec/cost-schema';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';

/** Options for {@link createServer}. */
export interface CreateServerOptions {
  /** Directory of cost artifacts (`*.inventory.yaml` etc.) to serve. */
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
 * Build the Express app serving `dir`. Exported (not just booted) so tests
 * can drive it with supertest without binding a socket.
 */
export function createServer(options: CreateServerOptions): Express {
  const repo = new FsRepository(resolve(options.dir));
  const app = express();

  // Rate limit every route (API reads/writes and the static/SPA file sinks).
  // This host binds localhost by default and serves a single user, so the cap
  // is deliberately generous — it never trips in normal use or the tests —
  // but it bounds abuse if the host is ever bound to a public interface.
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

  // ── Inventory ────────────────────────────────────────────────────────────

  app.get('/api/inventories', (_req, res) => {
    repo
      .listInventories()
      .then((list) => res.json(list))
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  app.get('/api/inventory', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readInventory(ref)
      .then((inventory) => res.json(inventory))
      .catch((error: unknown) => sendReadError(res, error));
  });

  app.put('/api/inventory', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = InventoryArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid inventory',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeInventory(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  // ── Spend ────────────────────────────────────────────────────────────────

  app.get('/api/spends', (_req, res) => {
    repo
      .listSpends()
      .then((list) => res.json(list))
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  app.get('/api/spend', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readSpend(ref)
      .then((spend) => res.json(spend))
      .catch((error: unknown) => sendReadError(res, error));
  });

  app.put('/api/spend', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = SpendArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid spend',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeSpend(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  // ── Attribution ──────────────────────────────────────────────────────────

  app.get('/api/attributions', (_req, res) => {
    repo
      .listAttributions()
      .then((list) => res.json(list))
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  app.get('/api/attribution', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readAttribution(ref)
      .then((attribution) => res.json(attribution))
      .catch((error: unknown) => sendReadError(res, error));
  });

  app.put('/api/attribution', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = AttributionArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid attribution',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeAttribution(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  // ── Tag plan ─────────────────────────────────────────────────────────────

  app.get('/api/tagplans', (_req, res) => {
    repo
      .listTagPlans()
      .then((list) => res.json(list))
      .catch((error: unknown) => res.status(500).json({ error: (error as Error).message }));
  });

  app.get('/api/tagplan', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readTagPlan(ref)
      .then((tagPlan) => res.json(tagPlan))
      .catch((error: unknown) => sendReadError(res, error));
  });

  app.put('/api/tagplan', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = TagPlanArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid tag plan',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeTagPlan(ref, parsed.data)
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
        .send('Cost Studio API is running. Build the client (pnpm build) to serve the UI.');
    });
  }

  return app;
}
