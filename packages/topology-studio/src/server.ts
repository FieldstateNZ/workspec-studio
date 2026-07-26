// The localhost host shell's HTTP server. A thin Express app over
// `FsRepository`: list / read / write for all three topology artifact kinds
// (topology, resource, environment), plus read-only derived endpoints
// (`resolve`/`reconcile`/`cost`) built on `@workspec/topology-model`,
// `@workspec/topology-recon`, and `@workspec/topology-cost`. Writes are
// Zod-validated (reusing the schema) before they reach the repository, so a
// malformed PUT is rejected with located issues, never written. Refs are
// repo-root-relative POSIX paths; traversal outside the served directory is
// refused. Mirrors `@workspec/decision-studio`'s/`@workspec/cost-studio`'s
// `server.ts` shape.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Slug } from '@workspec/schema-core';
import { computeTopologyCost } from '@workspec/topology-cost';
import { reconcile, summarizeDrift } from '@workspec/topology-recon';
import { EnvironmentArtifact, ResourceArtifact, TopologyArtifact } from '@workspec/topology-schema';
import { assembleMcpServer, mountMcpHttp } from '@workspec/mcp-core';
import type { McpToolProvider } from '@workspec/mcp-core';
import { loadDerivedTopology, MultipleObservedTopologiesError } from './derived-topology.js';
import { ArtifactValidationError, FsRepository, RefEscapesRootError } from './fs-repository.js';
import { loadAuthoredModel } from './load-authored-model.js';
import { loadCatalog } from './load-catalog.js';
import { resolveModelForEnv } from './resolve-model.js';

/** Options for {@link createServer}. */
export interface CreateServerOptions {
  /** Directory of topology artifacts (`.workspec/{topologies,resources,environments}`) to serve. */
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
function refFrom(req: Request, key = 'ref'): string | undefined {
  const raw = req.query[key];
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

/** Extracts and shape-validates `?env=` — a bare slug, never a path (so it can't be used to escape `.topology-actual/<env>/`). */
function envFrom(req: Request): string | undefined {
  const raw = req.query.env;
  if (typeof raw !== 'string' || !Slug.safeParse(raw).success) return undefined;
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
 * error's `.message` can carry the served root's absolute path, so it must
 * never reach the client — only the server log.
 */
function sendInternalError(res: Response, error: unknown, ref?: string): void {
  // `ref` is client-supplied, so it must not flow into console.error's
  // format-string argument (tainted format string / log injection); pass it
  // as a separate argument instead.
  if (ref !== undefined) {
    console.error('[topology-studio] unhandled error, ref:', ref, error);
  } else {
    console.error('[topology-studio] unhandled error:', error);
  }
  res.status(500).json({ error: 'internal error' });
}

function sendReadError(res: Response, error: unknown, ref?: string): void {
  if (sendIfRefEscapes(res, error)) return;
  if (error instanceof ArtifactValidationError) {
    res.status(422).json({ error: 'invalid artifact', ref: error.ref, issues: error.issues });
    return;
  }
  if (error instanceof MultipleObservedTopologiesError) {
    res.status(422).json({ error: 'multiple observed topology files', refs: error.refs });
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

  // ── Topology ─────────────────────────────────────────────────────────────

  app.get('/api/topologies', (_req, res) => {
    repo
      .listTopologies()
      .then((list) => res.json(list))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/topology', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readTopology(ref)
      .then((topology) => res.json(topology))
      .catch((error: unknown) => sendReadError(res, error, ref));
  });

  app.put('/api/topology', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = TopologyArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid topology',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeTopology(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => {
        if (sendIfRefEscapes(res, error)) return;
        sendInternalError(res, error, ref);
      });
  });

  // ── Resource ─────────────────────────────────────────────────────────────

  app.get('/api/resources', (_req, res) => {
    repo
      .listResources()
      .then((list) => res.json(list))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/resource', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readResource(ref)
      .then((resource) => res.json(resource))
      .catch((error: unknown) => sendReadError(res, error, ref));
  });

  app.put('/api/resource', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = ResourceArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid resource',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeResource(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => {
        if (sendIfRefEscapes(res, error)) return;
        sendInternalError(res, error, ref);
      });
  });

  // ── Environment ──────────────────────────────────────────────────────────

  app.get('/api/environments', (_req, res) => {
    repo
      .listEnvironments()
      .then((list) => res.json(list))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/environment', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    repo
      .readEnvironment(ref)
      .then((environment) => res.json(environment))
      .catch((error: unknown) => sendReadError(res, error, ref));
  });

  app.put('/api/environment', (req, res) => {
    const ref = refFrom(req);
    if (ref === undefined) {
      res.status(400).json({ error: 'missing or invalid ref' });
      return;
    }
    const parsed = EnvironmentArtifact.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: 'invalid environment',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    repo
      .writeEnvironment(ref, parsed.data)
      .then(() => res.status(204).end())
      .catch((error: unknown) => {
        if (sendIfRefEscapes(res, error)) return;
        sendInternalError(res, error, ref);
      });
  });

  // ── Derived, read-only views (resolve / reconcile / cost) ───────────────────

  app.get('/api/resolve', (req, res) => {
    const env = envFrom(req);
    if (env === undefined) {
      res.status(400).json({ error: 'missing or invalid env' });
      return;
    }
    loadAuthoredModel(repo)
      .then((model) => {
        if (model.topology === null) {
          res.status(422).json({ error: 'no single topology found', diagnostics: model.diagnostics });
          return;
        }
        res.json(resolveModelForEnv(model, env));
      })
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/reconcile', (req, res) => {
    const env = envFrom(req);
    if (env === undefined) {
      res.status(400).json({ error: 'missing or invalid env' });
      return;
    }
    void (async () => {
      try {
        const model = await loadAuthoredModel(repo);
        if (model.topology === null) {
          res.status(422).json({ error: 'no single topology found', diagnostics: model.diagnostics });
          return;
        }
        const resolved = resolveModelForEnv(model, env);
        if (resolved === undefined) {
          res.status(422).json({ error: 'could not resolve the topology' });
          return;
        }
        const outcome = await loadDerivedTopology(repo, env);
        if (outcome.kind === 'read-error') {
          sendReadError(res, outcome.error, outcome.ref);
          return;
        }
        const drifts = reconcile(resolved, outcome.derived, env);
        res.json({ drifts, summary: summarizeDrift(drifts) });
      } catch (error) {
        sendInternalError(res, error);
      }
    })();
  });

  app.get('/api/cost', (req, res) => {
    const env = envFrom(req);
    if (env === undefined) {
      res.status(400).json({ error: 'missing or invalid env' });
      return;
    }
    void (async () => {
      try {
        const model = await loadAuthoredModel(repo);
        if (model.topology === null) {
          res.status(422).json({ error: 'no single topology found', diagnostics: model.diagnostics });
          return;
        }
        const resolved = resolveModelForEnv(model, env);
        if (resolved === undefined) {
          res.status(422).json({ error: 'could not resolve the topology' });
          return;
        }
        if (resolved.catalog === null) {
          res.status(422).json({ error: 'topology declares no spec.catalog' });
          return;
        }
        const catalogOutcome = await loadCatalog(repo, resolved.catalog);
        if (catalogOutcome.kind === 'not-found') {
          res.status(404).json({ error: 'catalog not found' });
          return;
        }
        if (catalogOutcome.kind === 'invalid') {
          res.status(422).json({ error: 'invalid catalog', issues: catalogOutcome.issues });
          return;
        }
        res.json(computeTopologyCost(resolved, catalogOutcome.catalog));
      } catch (error) {
        sendInternalError(res, error);
      }
    })();
  });

  // ── Generic file-tree read endpoints, for the browser client's
  // `TopologyFileSource` (`@workspec/topology-ui`'s `TopologyStudioHost.source`
  // reads a whole tree, not one artifact at a time — these three routes are
  // the minimal HTTP shape that port needs: list/read/exists). Read-only:
  // this authored-only slice always renders with `capabilities.editLayout:
  // false`, so no write route exists here. ──────────────────────────────────

  app.get('/api/tree/list', (req, res) => {
    const dir = refFrom(req, 'dir');
    if (dir === undefined) {
      res.status(400).json({ error: 'missing or invalid dir' });
      return;
    }
    repo
      .createFileSource()
      .listFiles(dir)
      .then((files) => res.json(files))
      .catch((error: unknown) => sendInternalError(res, error));
  });

  app.get('/api/tree/read', (req, res) => {
    const path = refFrom(req, 'path');
    if (path === undefined) {
      res.status(400).json({ error: 'missing or invalid path' });
      return;
    }
    readFile(repo.resolve(path), 'utf8')
      .then((text) => res.type('text/plain').send(text))
      .catch((error: unknown) => sendReadError(res, error, path));
  });

  app.get('/api/tree/exists', (req, res) => {
    const path = refFrom(req, 'path');
    if (path === undefined) {
      res.status(400).json({ error: 'missing or invalid path' });
      return;
    }
    repo
      .createFileSource()
      .exists(path)
      .then((value) => res.json({ exists: value }))
      .catch((error: unknown) => sendInternalError(res, error));
  });

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
        .send('Topology Studio API is running. Build the client (pnpm build) to serve the UI.');
    });
  }

  return app;
}
