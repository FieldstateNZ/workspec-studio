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

import { CatalogArtifact } from './catalog.js';
import { DecisionArtifact } from './decision.js';
import type { Catalog } from './catalog.js';
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
  /** The decision's `metadata.id`. */
  id: string;
  /** The decision's `metadata.title`, when known. */
  title?: string;
}

/** A catalog list entry: its ref plus enough identity to render a picker. */
export interface CatalogRef {
  /** The opaque ref to pass back to `readCatalog`/`writeCatalog`. */
  ref: Ref;
  /** The catalog's `metadata.id`. */
  id: string;
  /** The catalog's `metadata.name`, when known. */
  title?: string;
}

/**
 * The storage port. **Exactly six methods** — three per artifact kind. Any
 * implementation (filesystem, in-memory, graph-backed) provides these and only
 * these; extending the port is a deliberate cross-cutting change, not a local
 * one.
 */
export interface DecisionRepositoryPort {
  /** List every decision artifact the repository can see. */
  listDecisions(): Promise<DecisionRef[]>;
  /** Read + validate a decision by ref. Rejects if missing or invalid. */
  readDecision(ref: Ref): Promise<Decision>;
  /** Validate + persist a decision at ref. Rejects if invalid. */
  writeDecision(ref: Ref, decision: Decision): Promise<void>;
  /** List every catalog artifact the repository can see. */
  listCatalogs(): Promise<CatalogRef[]>;
  /** Read + validate a catalog by ref. Rejects if missing or invalid. */
  readCatalog(ref: Ref): Promise<Catalog>;
  /** Validate + persist a catalog at ref. Rejects if invalid. */
  writeCatalog(ref: Ref, catalog: Catalog): Promise<void>;
}

/** The exact method names of the port, as a runtime-checkable tuple. */
export const DECISION_REPOSITORY_METHODS = [
  'listDecisions',
  'readDecision',
  'writeDecision',
  'listCatalogs',
  'readCatalog',
  'writeCatalog',
] as const;

/** Seed data for {@link createMemoryRepository}. Both maps are keyed by ref. */
export interface MemoryRepositorySeed {
  /** Decisions to preload, keyed by the ref they are stored under. */
  decisions?: Record<Ref, Decision>;
  /** Catalogs to preload, keyed by the ref they are stored under. */
  catalogs?: Record<Ref, Catalog>;
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

function validateCatalog(ref: Ref, catalog: Catalog): Catalog {
  const result = CatalogArtifact.safeParse(catalog);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid catalog at "${ref}" (${where})`);
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
  const catalogs = new Map<Ref, Catalog>();

  for (const [ref, decision] of Object.entries(seed.decisions ?? {})) {
    decisions.set(ref, cloneJson(validateDecision(ref, decision)));
  }
  for (const [ref, catalog] of Object.entries(seed.catalogs ?? {})) {
    catalogs.set(ref, cloneJson(validateCatalog(ref, catalog)));
  }

  return {
    listDecisions(): Promise<DecisionRef[]> {
      return Promise.resolve(
        [...decisions.entries()].map(([ref, decision]) => ({
          ref,
          id: decision.metadata.id,
          ...(decision.metadata.title !== undefined ? { title: decision.metadata.title } : {}),
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
    listCatalogs(): Promise<CatalogRef[]> {
      return Promise.resolve(
        [...catalogs.entries()].map(([ref, catalog]) => ({
          ref,
          id: catalog.metadata.id,
          ...(catalog.metadata.name !== undefined ? { title: catalog.metadata.name } : {}),
        })),
      );
    },
    readCatalog(ref: Ref): Promise<Catalog> {
      const catalog = catalogs.get(ref);
      if (catalog === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no catalog at "${ref}"`));
      }
      return Promise.resolve(cloneJson(catalog));
    },
    writeCatalog(ref: Ref, catalog: Catalog): Promise<void> {
      try {
        catalogs.set(ref, cloneJson(validateCatalog(ref, catalog)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
  };
}
