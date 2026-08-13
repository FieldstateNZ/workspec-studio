// The repository port — the single storage abstraction Decision Studio's UI
// depends on. One UI runs standalone over the filesystem (`FsRepository`, in the
// studio package) and, later, inside WorkSpec Enterprise over a graph-backed
// implementation. Both satisfy this port.
//
// It is deliberately SMALL: exactly six methods, no watch/subscribe, no history,
// no concurrency control. That minimal surface is the standalone feature ceiling
// by design (the working tree + git already provide versioning and review).
//
// `MemoryRepository` is the in-memory test double that UI component tests
// (S4/S5) run against — factory-built, never a shared mutable fixture.

import { DecisionArtifact } from './decision.js';
import type { Decision } from './decision.js';

/**
 * An opaque reference to a stored artifact — an id or path. Standalone
 * (`FsRepository`) uses repo-root-relative file paths; a graph-backed
 * implementation may use node ids. Callers treat it as an opaque string.
 */
export type Ref = string;

/** A decision list entry: its ref plus enough identity to render a picker. */
export interface DecisionRef {
  /** The opaque ref to pass back to `readDecision`/`writeDecision`. */
  ref: Ref;
  /** The decision's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The decision's `spec.title`. */
  title: string;
}

/** A catalog list entry: its ref plus enough identity to render a picker. */
/**
 * The core Decision storage port. Git provides history and review; this port
 * only discovers, reads, and writes repository-native Decision records.
 */
export interface DecisionRepositoryPort {
  /** List every decision artifact the repository can see. */
  listDecisions(): Promise<DecisionRef[]>;
  /** Read + validate a decision by ref. Rejects if missing or invalid. */
  readDecision(ref: Ref): Promise<Decision>;
  /** Validate + persist a decision at ref. Rejects if invalid. */
  writeDecision(ref: Ref, decision: Decision): Promise<void>;
}

/** The exact method names of the port, as a runtime-checkable tuple. */
export const DECISION_REPOSITORY_METHODS = [
  'listDecisions',
  'readDecision',
  'writeDecision',
] as const;

/** Seed data for {@link createMemoryRepository}. Both maps are keyed by ref. */
export interface MemoryRepositorySeed {
  /** Decisions to preload, keyed by the ref they are stored under. */
  decisions?: Record<Ref, Decision>;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function validateDecision(ref: Ref, decision: Decision): Decision {
  const result = DecisionArtifact.safeParse(decision);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid decision at "${ref}" (${where})`);
  }
  return result.data;
}

/**
 * Build an in-memory {@link DecisionRepositoryPort} — the UI test double.
 *
 * Factory-built (never a shared mutable module singleton) so each test owns an
 * isolated instance. Writes validate through Zod; reads and the seed both return
 * deep clones, so a caller mutating a returned artifact cannot corrupt the
 * store. Insertion order is preserved for stable `list*` output.
 */
export function createMemoryRepository(seed: MemoryRepositorySeed = {}): DecisionRepositoryPort {
  const decisions = new Map<Ref, Decision>();

  for (const [ref, decision] of Object.entries(seed.decisions ?? {})) {
    decisions.set(ref, cloneJson(validateDecision(ref, decision)));
  }

  return {
    listDecisions(): Promise<DecisionRef[]> {
      return Promise.resolve(
        [...decisions.entries()].map(([ref, decision]) => ({
          ref,
          ...(decision.metadata.slug !== undefined ? { slug: decision.metadata.slug } : {}),
          title: decision.spec.title,
        })),
      );
    },
    readDecision(ref: Ref): Promise<Decision> {
      const decision = decisions.get(ref);
      if (decision === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no decision at "${ref}"`));
      }
      return Promise.resolve(cloneJson(decision));
    },
    writeDecision(ref: Ref, decision: Decision): Promise<void> {
      try {
        decisions.set(ref, cloneJson(validateDecision(ref, decision)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
  };
}
