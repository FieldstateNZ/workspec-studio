// FsRepository — the standalone, filesystem-backed implementation of the S3
// repository port. It discovers `*.decision.yaml` / `*.catalog.yaml` artifacts
// by a manual recursive walk of a root directory (no glob dependency), reads
// them through the schema's parse+validate helpers, and writes them back with
// the `$schema` directive header and preserved comments.
//
// Refs are repo-root-relative POSIX paths (`examples/hosting-platform/platform.catalog.yaml`)
// so they are stable and platform-independent.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import {
  CATALOG_SCHEMA_DIRECTIVE,
  DECISION_SCHEMA_DIRECTIVE,
  isCatalogFile,
  isDecisionFile,
  parseCatalogYaml,
  parseDecisionYaml,
} from '@workspec/decision-schema';
import type {
  Catalog,
  CatalogRef,
  Decision,
  DecisionRef,
  DecisionRepositoryPort,
  ParseIssue,
  Ref,
} from '@workspec/decision-schema';
import { CatalogArtifact, DecisionArtifact } from '@workspec/decision-schema';
import { serializeArtifact } from './serialize.js';

/** Directories never descended into during discovery. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

/**
 * Thrown by `read*` when a file fails parse or schema validation. Carries the
 * structured issues (each with a source line/col) so the CLI can print
 * `file:line:col: message` diagnostics.
 */
export class ArtifactValidationError extends Error {
  constructor(
    /** The ref that failed. */
    readonly ref: Ref,
    /** The parse/validation issues, in report order. */
    readonly issues: ParseIssue[],
  ) {
    const first = issues[0];
    super(`${ref}: ${first ? first.message : 'invalid artifact'} (${issues.length} issue(s))`);
    this.name = 'ArtifactValidationError';
  }
}

function toPosixRef(root: string, absPath: string): Ref {
  return relative(root, absPath).split(sep).join('/');
}

async function walk(dir: string, onFile: (absPath: string) => void): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir → skip
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, onFile);
    } else if (entry.isFile()) {
      if (isDecisionFile(entry.name) || isCatalogFile(entry.name)) onFile(full);
    }
  }
}

/**
 * A repository backed by a directory tree of YAML artifacts.
 *
 * Construct with the root directory to scan (defaults to `process.cwd()`).
 * Implements the six-method {@link DecisionRepositoryPort}; the extra
 * `root` / `resolve` / `resolveCatalogRef` helpers are conveniences for the CLI
 * and are not part of the port.
 */
export class FsRepository implements DecisionRepositoryPort {
  readonly root: string;

  constructor(root: string = process.cwd()) {
    this.root = resolve(root);
  }

  /** Absolute filesystem path for a repo-root-relative ref. */
  resolve(ref: Ref): string {
    return isAbsolute(ref) ? ref : resolve(this.root, ref);
  }

  /** Resolve the catalog ref a decision points at (relative to the decision file). */
  resolveCatalogRef(decisionRef: Ref, decision: Decision): Ref {
    const dir = posix.dirname(decisionRef.split(sep).join('/'));
    const joined = posix.normalize(posix.join(dir, decision.spec.catalog));
    return joined.replace(/^\.\//, '');
  }

  private async discover(): Promise<{ decisions: Ref[]; catalogs: Ref[] }> {
    const decisions: Ref[] = [];
    const catalogs: Ref[] = [];
    await walk(this.root, (abs) => {
      const ref = toPosixRef(this.root, abs);
      if (isDecisionFile(abs)) decisions.push(ref);
      else if (isCatalogFile(abs)) catalogs.push(ref);
    });
    decisions.sort();
    catalogs.sort();
    return { decisions, catalogs };
  }

  async listDecisions(): Promise<DecisionRef[]> {
    const { decisions } = await this.discover();
    const out: DecisionRef[] = [];
    for (const ref of decisions) {
      let id = posix.basename(ref).replace(/\.decision\.yaml$/, '');
      let title: string | undefined;
      try {
        const parsed = parseDecisionYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          title = parsed.data.metadata.title;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(title !== undefined ? { ref, id, title } : { ref, id });
    }
    return out;
  }

  async listCatalogs(): Promise<CatalogRef[]> {
    const { catalogs } = await this.discover();
    const out: CatalogRef[] = [];
    for (const ref of catalogs) {
      let id = posix.basename(ref).replace(/\.catalog\.yaml$/, '');
      let title: string | undefined;
      try {
        const parsed = parseCatalogYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          title = parsed.data.metadata.name;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(title !== undefined ? { ref, id, title } : { ref, id });
    }
    return out;
  }

  async readDecision(ref: Ref): Promise<Decision> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseDecisionYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readCatalog(ref: Ref): Promise<Catalog> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseCatalogYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async writeDecision(ref: Ref, decision: Decision): Promise<void> {
    const validated = DecisionArtifact.safeParse(decision);
    if (!validated.success) {
      throw new ArtifactValidationError(
        ref,
        validated.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          line: 0,
          col: 0,
        })),
      );
    }
    await this.writeText(
      ref,
      serializeArtifact(
        validated.data,
        DECISION_SCHEMA_DIRECTIVE,
        await this.readTextIfExists(ref),
      ),
    );
  }

  async writeCatalog(ref: Ref, catalog: Catalog): Promise<void> {
    const validated = CatalogArtifact.safeParse(catalog);
    if (!validated.success) {
      throw new ArtifactValidationError(
        ref,
        validated.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          line: 0,
          col: 0,
        })),
      );
    }
    await this.writeText(
      ref,
      serializeArtifact(validated.data, CATALOG_SCHEMA_DIRECTIVE, await this.readTextIfExists(ref)),
    );
  }

  private async readTextIfExists(ref: Ref): Promise<string | undefined> {
    try {
      return await readFile(this.resolve(ref), 'utf8');
    } catch {
      return undefined;
    }
  }

  private async writeText(ref: Ref, text: string): Promise<void> {
    const abs = this.resolve(ref);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text, 'utf8');
  }
}
