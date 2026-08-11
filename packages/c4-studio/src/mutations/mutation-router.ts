// The write API's Express router: six zod-gated JSON routes over the
// mutation services. The client NEVER supplies a file path on any of them
// — only slugs (shape-gated by `slugField`) and kind enums — and every
// path is constructed server-side via `@workspec/c4-schema`'s path
// helpers, so traversal is impossible by construction; `createFsSource`'s
// resolve-time containment and `TreeIo`'s delete containment backstop it,
// the same two-layer discipline as the existing `.layout/` PUT.
//
//   POST   /elements        create element (+ optional diagram drop + position pin)
//   PATCH  /elements        update fields / rename (title only — slug is stable)
//   DELETE /elements        delete element EVERYWHERE + scrub dangling refs
//   DELETE /diagram-nodes   remove a node ref from ONE diagram (canvas gesture)
//   POST   /relations       append a diagram edge
//   PATCH  /relations       re-label the (from, to) edge(s)
//   DELETE /relations       remove the (from, to) edge(s) + layout hint
//
// Two cross-cutting guards ride the router itself: a Host-header check
// (DNS-rebinding backstop — see `host-header-guard.ts`) and a FIFO queue
// serializing every mutation's read→edit→write span (lost-update
// prevention — see `mutation-queue.ts`). Both are INJECTED by `createServer`
// rather than built here, because neither is router-shaped: the guard's
// allowlist depends on the configured `--host` bind address, and the queue
// must also cover `PUT /api/file` (the `.layout/` pin write), which several
// of these very services read-modify-write. One queue per SERVED TREE is the
// correct granularity, and `createServer` is the only scope that sees the
// whole tree's writers.

import { Router } from 'express';
import type { RequestHandler, Response } from 'express';
import type { MutationQueue } from './mutation-queue.js';
import type { ZodType } from 'zod';
import type { C4FileSource } from '@workspec/c4-model';
import { RefEscapesRootError } from '@workspec/c4-model/fs';
import { createElement } from './create-element.js';
import { createElementRequestSchema } from './create-element-request.js';
import { createRelation } from './create-relation.js';
import { createRelationRequestSchema } from './create-relation-request.js';
import { deleteElement } from './delete-element.js';
import { deleteElementRequestSchema } from './delete-element-request.js';
import { deleteRelation } from './delete-relation.js';
import { deleteRelationRequestSchema } from './delete-relation-request.js';
import type { MutationResult } from './mutation-result.js';
import { removeDiagramNode } from './remove-diagram-node.js';
import { removeDiagramNodeRequestSchema } from './remove-diagram-node-request.js';
import { renameRelation } from './rename-relation.js';
import { renameRelationRequestSchema } from './rename-relation-request.js';
import type { TreeIo } from './tree-io.js';
import { updateElement } from './update-element.js';
import { updateElementRequestSchema } from './update-element-request.js';

/** Everything the mutation routes need from the host server. */
export interface MutationRouterDeps {
  readonly source: C4FileSource;
  readonly treeIo: TreeIo;
  /**
   * The served tree's ONE write queue. Shared with `PUT /api/file` so a
   * drag-to-pin cannot interleave with a mutation that scrubs or upserts
   * the same `.layout/` file.
   */
  readonly queue: MutationQueue;
  /** The served tree's Host-header guard (allowlist includes `--host`). */
  readonly hostGuard: RequestHandler;
}

/**
 * Mirrors `server.ts`'s non-leaky 500 fallback: the real error goes to the
 * server log only (an fs error's message can carry the served root's
 * absolute path), and nothing client-supplied rides the format-string
 * position. `RefEscapesRootError` maps to the same 400 the file proxy uses.
 */
function sendUnexpectedError(res: Response, error: unknown): void {
  if (error instanceof RefEscapesRootError) {
    res.status(400).json({ error: 'path escapes served root' });
    return;
  }
  console.error('[c4-studio] mutation error:', error);
  res.status(500).json({ error: 'internal error' });
}

/**
 * Wraps one mutation service as an Express handler: zod-parse the body
 * (400 with flattened issues on failure — the diagnostics the client's
 * write-error banner surfaces), run the service THROUGH the router's FIFO
 * queue (every service is a read→edit→write span over shared files; two
 * interleaved spans on one file is a lost update — A2 review FIX 1), map
 * its `MutationResult` to JSON. Services never throw for expected
 * failures; anything thrown is unexpected and goes through the generic
 * 500. Zod parsing stays OUTSIDE the queue — it is pure and touching no
 * files, so invalid requests never occupy the write lock.
 */
function mutationHandler<TBody, TValue>(
  queue: <T>(task: () => Promise<T>) => Promise<T>,
  schema: ZodType<TBody>,
  successStatus: 200 | 201,
  run: (body: TBody) => Promise<MutationResult<TValue>>,
): RequestHandler {
  return (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid request',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    queue(() => run(parsed.data))
      .then((result) => {
        if (result.ok) {
          res.status(successStatus).json(result.value);
          return;
        }
        const { status, message, issues } = result.error;
        res.status(status).json({ error: message, ...(issues !== undefined ? { issues } : {}) });
      })
      .catch((error: unknown) => sendUnexpectedError(res, error));
  };
}

/**
 * Builds the mutation router. Mounted by `createServer` under `/api`
 * (after the read/`.layout/` proxy routes, before the SPA fallback);
 * `express.json`, the rate limiter and the app-level `/api` Host guard are
 * already applied by the time a request reaches here. The guard is mounted
 * AGAIN on the router's own paths — deliberate defence in depth, so this
 * exported router cannot be mounted somewhere that forgot it — and every
 * mutation route runs through the injected queue, so no route can forget
 * that either.
 */
export function buildMutationRouter(deps: MutationRouterDeps): Router {
  const router = Router();
  const queue = deps.queue;

  router.use(['/elements', '/diagram-nodes', '/relations'], deps.hostGuard);

  router.post(
    '/elements',
    mutationHandler(queue, createElementRequestSchema, 201, (body) =>
      createElement(deps.source, body),
    ),
  );
  router.patch(
    '/elements',
    mutationHandler(queue, updateElementRequestSchema, 200, (body) =>
      updateElement(deps.source, body),
    ),
  );
  router.delete(
    '/elements',
    mutationHandler(queue, deleteElementRequestSchema, 200, (body) =>
      deleteElement(deps.source, deps.treeIo, body),
    ),
  );

  router.delete(
    '/diagram-nodes',
    mutationHandler(queue, removeDiagramNodeRequestSchema, 200, (body) =>
      removeDiagramNode(deps.source, body),
    ),
  );

  router.post(
    '/relations',
    mutationHandler(queue, createRelationRequestSchema, 201, (body) =>
      createRelation(deps.source, body),
    ),
  );
  router.patch(
    '/relations',
    mutationHandler(queue, renameRelationRequestSchema, 200, (body) =>
      renameRelation(deps.source, body),
    ),
  );
  router.delete(
    '/relations',
    mutationHandler(queue, deleteRelationRequestSchema, 200, (body) =>
      deleteRelation(deps.source, body),
    ),
  );

  return router;
}
