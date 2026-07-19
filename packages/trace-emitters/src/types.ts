// The emitter SEAM — the one contract a test-framework binding implements.
//
// An `Emitter` binds system-requirement artifacts to a test toolchain IN BOTH
// DIRECTIONS (spec §3): `emit(sysreqs) → files` (greenfield) and
// `ingest(raw, meta) → TestRun` (brownfield), plus its declared conventions.
// Adding a framework means adding an `Emitter` and NOTHING else — the engine
// (@workspec/trace-model), the CLI (T4), and the UI all speak this shape, never
// a framework's own.
//
// Everything here is PURE data + pure functions: no filesystem, no clock, no
// DOM. The caller (the T4 CLI) owns IO — it reads the sysreq files, hands the
// emitter their loader-derived slugs, writes the returned `EmittedFile`
// descriptors to disk, and supplies run identity/timestamp as `RunMeta`.

import type { SystemRequirement, TestRun } from '@workspec/req-schema';

/**
 * A system-requirement paired with the authoritative slug the loader derived
 * from its filename.
 *
 * The slug is passed EXPLICITLY rather than read from `artifact.metadata.slug`
 * because that field is optional (schema-core `MetadataSchema`): per the spec,
 * slug = filename stem = identity (§4), and the file — not a hand-written
 * metadata key — is the source of truth. This is the SAME slug the derivation
 * engine joins on (`Located.slug` in @workspec/trace-model), so the tag `emit`
 * writes and the key `ingest` recovers line up with what `buildModel` proves.
 */
export interface SysReqInput {
  /** The loader-derived slug (path stem) — the sysreq's stable identity. */
  slug: string;
  /** The validated system-requirement artifact. */
  sysreq: SystemRequirement;
}

/**
 * One emitted file, as a PURE descriptor — path + text, never written to disk.
 * The T4 CLI decides where these land and performs the write.
 */
export interface EmittedFile {
  /** Relative path for the file, keyed on the sysreq slug (e.g. `<slug>.feature`). */
  path: string;
  /** The file's full text content. Deterministic — byte-stable for a given input. */
  content: string;
}

/**
 * Run identity/timestamp supplied by the CALLER (the T4 CLI) on `ingest`. The
 * emitter is pure and has NO clock — `Date.now()`/`new Date()` are banned — so
 * the run's `id`/`ts` come from here, not from the emitter.
 */
export interface RunMeta {
  /** Run identifier, e.g. the run timestamp stem `"2026-07-09T02-14Z"`. */
  id: string;
  /** ISO-8601 datetime the run was produced (`TestRun.ts`). */
  ts: string;
  /** Optional commit SHA the run executed against. */
  sha?: string;
  /** Optional CI provider label, e.g. `"github-actions"`. */
  ci?: string;
}

/**
 * A convention this emitter declares and honors — surfaced in the UI (spec §3)
 * as the human-readable contract between sysreq artifacts and the toolchain.
 */
export interface EmitterConvention {
  /** Stable convention id, e.g. `"feature-file-per-sysreq"`. */
  name: string;
  /** One-line human description of what the convention guarantees. */
  description: string;
}

/**
 * The provider seam. Every test-framework binding (`cucumber`, a future
 * `junit`) implements exactly this — and only this. Both methods are PURE and
 * DETERMINISTIC: identical input yields byte-identical output.
 */
export interface Emitter {
  /** The emitter's name, e.g. `"cucumber"` — becomes `TestRun.emitter` on ingest. */
  readonly name: string;
  /** The conventions this emitter declares (spec §3), as displayable data. */
  readonly conventions: readonly EmitterConvention[];
  /**
   * Greenfield: turn system-requirements into test files (one per sysreq).
   * Returns descriptors — does NOT touch the filesystem.
   */
  emit(sysreqs: readonly SysReqInput[]): EmittedFile[];
  /**
   * Brownfield: parse a test toolchain's raw report into a `TestRun`, keyed on
   * the sysreq slug recovered via the emitter's own tag convention. Defensive —
   * NEVER throws on malformed `raw`; unparseable scenarios are skipped.
   */
  ingest(raw: unknown, meta: RunMeta): TestRun;
}
