// The trace repository PORT — the filesystem boundary `@workspec/trace-model`
// deliberately lacks. The pure engine consumes a `TraceTree` of located,
// validated artifacts plus a `TestRun[]`; SOMETHING has to read `.workspec/`
// off disk and produce those. That something is this port.
//
// The port is injectable (`RunDeps.repository`) so the CLI's commands can be
// driven in tests against an in-memory tree — no real filesystem, no clock —
// exactly the way `@workspec/cost-studio` injects its `CostRepositoryPort`. The
// real, filesystem-backed implementation is `FsRepository` (see
// `fs-repository.ts`); the in-memory double is `createMemoryRepository` below.

import type { TestRun, TraceTree } from '@workspec/trace-model';

/**
 * One problem the loader hit reading a `.workspec/` file — collected as DATA,
 * never thrown past the CLI boundary. `verify` surfaces these as errors and
 * exits non-zero; `emit`/`ingest` ignore the ones that don't concern them.
 * Mirrors `@workspec/cost-studio`'s `ArtifactValidationError`/`ParseIssue`
 * handling, flattened to a plain record so the port stays IO-agnostic.
 */
export interface LoadIssue {
  /** Repo-relative path of the file the problem is about. */
  readonly file: string;
  /** Human-readable description of the problem. */
  readonly message: string;
  /** What went wrong — a YAML parse error, a schema violation, or a bad filename/slug. */
  readonly kind: 'parse' | 'schema' | 'filename';
  /** 1-based source line, when the loader could attribute one (best-effort). */
  readonly line?: number;
}

/** The located, validated artifact tree plus any problems the loader collected. */
export interface LoadedTree {
  readonly tree: TraceTree;
  readonly issues: readonly LoadIssue[];
}

/** The validated ingested runs plus any problems the loader collected. */
export interface LoadedRuns {
  readonly runs: readonly TestRun[];
  readonly issues: readonly LoadIssue[];
}

/**
 * The filesystem boundary, as a narrow port. Every method speaks repo-root-
 * relative refs; the implementation constrains them to the served root.
 * Validation problems are returned as `LoadIssue[]` (never thrown) so the CLI
 * decides how to surface them; genuinely exceptional IO (a missing results
 * file, a ref escaping the root) still throws, and the CLI catches it.
 */
export interface TraceRepositoryPort {
  /**
   * Walk `.workspec/` and load + validate every artifact into a `TraceTree`,
   * deriving each slug from its filename (`slugFromPath` — the file IS the
   * identity). Invalid files become `LoadIssue`s and are omitted from the tree.
   */
  loadTree(): Promise<LoadedTree>;
  /**
   * Load + validate every `<runsDir>/*.json` `TestRun` (spec §4.5). `runsDir` is
   * repo-relative (default `.workspec/.runs`). A missing runs dir is not an
   * error — it yields zero runs (a tree can be verified before any run exists).
   */
  loadRuns(runsDir: string): Promise<LoadedRuns>;
  /** Read a raw file (repo-relative) as UTF-8 — for `ingest`'s results file. Throws if unreadable. */
  readFile(ref: string): Promise<string>;
  /** Write text to a repo-relative ref (emit's `.feature` files, ingest's run JSON), creating parents. */
  writeFile(ref: string, content: string): Promise<void>;
}

/** Seed state for {@link createMemoryRepository}. Every field is optional. */
export interface MemoryRepositoryInit {
  /** The located tree the double returns from `loadTree` (missing kinds default to empty). */
  readonly tree?: Partial<TraceTree>;
  /** Problems `loadTree` reports alongside `tree`. */
  readonly treeIssues?: readonly LoadIssue[];
  /** The runs `loadRuns` returns (regardless of `runsDir`). */
  readonly runs?: readonly TestRun[];
  /** Problems `loadRuns` reports alongside `runs`. */
  readonly runIssues?: readonly LoadIssue[];
  /** Pre-seeded readable files, keyed by ref — e.g. a results file for `ingest`. */
  readonly files?: Readonly<Record<string, string>>;
}

/** A {@link TraceRepositoryPort} double that also exposes what was written to it. */
export interface MemoryRepository extends TraceRepositoryPort {
  /** Every `writeFile(ref, content)` the CLI performed, in call order-independent map form. */
  readonly writes: Map<string, string>;
}

/**
 * An in-memory {@link TraceRepositoryPort} for tests and embedders. `loadTree`/
 * `loadRuns` return the seeded tree/runs; `readFile` reads from the seeded (or
 * written) file map; `writeFile` records into `writes` so a test can assert on
 * the emitted `.feature` files or the ingested run JSON without touching disk.
 */
export function createMemoryRepository(init: MemoryRepositoryInit = {}): MemoryRepository {
  const writes = new Map<string, string>();
  const seeded = new Map<string, string>(Object.entries(init.files ?? {}));

  const tree: TraceTree = {
    actors: init.tree?.actors ?? [],
    features: init.tree?.features ?? [],
    userRequirements: init.tree?.userRequirements ?? [],
    systemRequirements: init.tree?.systemRequirements ?? [],
  };

  return {
    writes,
    loadTree(): Promise<LoadedTree> {
      return Promise.resolve({ tree, issues: init.treeIssues ?? [] });
    },
    loadRuns(): Promise<LoadedRuns> {
      return Promise.resolve({ runs: init.runs ?? [], issues: init.runIssues ?? [] });
    },
    readFile(ref: string): Promise<string> {
      const found = writes.get(ref) ?? seeded.get(ref);
      if (found === undefined) {
        return Promise.reject(new Error(`no such file: ${ref}`));
      }
      return Promise.resolve(found);
    },
    writeFile(ref: string, content: string): Promise<void> {
      writes.set(ref, content);
      return Promise.resolve();
    },
  };
}
