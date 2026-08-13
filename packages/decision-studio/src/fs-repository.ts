// FsRepository — the standalone, filesystem-backed implementation of the S3
// `DecisionRepositoryPort`. Discovery is a per-kind DIRECTORY WALK of
// `.workspec/<type-dir>` (from `@workspec/decision-schema`'s `typeDirectoryFor`)
// — a flat, non-recursive `readdir`, not a whole-tree walk keyed off filename
// suffixes. Identity is the FILENAME: a `.workspec/<kind-dir>/<slug>.yaml`
// artifact's slug is derived from its filename via `slugFromPath`
// (`@workspec/schema-core`), the file IS the identity — mirroring
// `@workspec/cost-studio`'s and `@workspec/trace-studio`'s `FsRepository`s.
//
// Unlike those, writes here go through `serializeArtifact` (`./serialize.js`),
// a comment-preserving patch step: Decision Studio's artifacts are hand-authored
// and re-edited through the UI, so an author's section comments and lever notes
// must survive a round-trip — byte-stable-from-scratch serialization is not the
// product contract here the way it is for cost/traceability artifacts.
//
// Refs are repo-root-relative POSIX paths (`.workspec/decisions/hosting-platform.yaml`)
// so they are stable and platform-independent.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import {
  DECISION_SCHEMA_DIRECTIVE,
  parseDecisionYaml,
  typeDirectoryFor,
} from '@workspec/decision-schema';
import type {
  Decision,
  DecisionRef,
  DecisionRepositoryPort,
  ParseIssue,
  ParseResult,
  Ref,
} from '@workspec/decision-schema';
import { DecisionArtifact } from '@workspec/decision-schema';
import { resolveWithinRoot } from './path-containment.js';
import { serializeArtifact } from './serialize.js';

export { RefEscapesRootError } from './path-containment.js';

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

/** One `list*` entry: the ref, its filename-derived slug, and a best-effort title. */
interface KindRef {
  ref: Ref;
  slug: string;
  title?: string;
}

/**
 * A repository backed by a directory tree of YAML artifacts.
 *
 * Construct with the root directory to scan (defaults to `process.cwd()`).
 * Implements the three-operation {@link DecisionRepositoryPort}. The extra
 * `root` / `resolve` helpers are filesystem conveniences for the CLI.
 */
export class FsRepository implements DecisionRepositoryPort {
  readonly root: string;

  constructor(root: string = process.cwd()) {
    this.root = resolve(root);
  }

  /**
   * Absolute filesystem path for a repo-root-relative ref. Throws
   * {@link RefEscapesRootError} (re-exported from this module) if `ref`
   * would resolve outside `root` — a POSIX absolute path, `..` traversal,
   * or, when this process is actually running on Windows, a drive-letter or
   * UNC path.
   */
  resolve(ref: Ref): string {
    return resolveWithinRoot(this.root, ref);
  }

  /**
   * Lists one kind's artifacts: a flat (non-recursive) read of `kindDir`,
   * filtered to `.yaml` files whose filename stem is a valid slug (a file
   * that fails either check is not a WorkSpec artifact of this kind and is
   * silently skipped). `slug` is always the FILENAME-derived identity (never
   * a hand-written `metadata.slug`) — the file IS the identity, per the
   * `.workspec/<kind-dir>/<slug>.yaml` convention. `title` is a best-effort
   * read via `titleOf`: a file that fails to parse/validate still lists (by
   * its filename slug alone) so `validate` can find and report it.
   */
  private async listKind<T>(
    kindDir: string,
    parse: (text: string) => ParseResult<T>,
    titleOf: (data: T) => string | undefined,
  ): Promise<KindRef[]> {
    let entries;
    try {
      entries = await readdir(this.resolve(kindDir), { withFileTypes: true });
    } catch {
      return []; // absent kind dir → no artifacts of this kind
    }

    const names = entries
      .filter((e) => e.isFile() && e.name.endsWith(FILE_EXTENSION))
      .map((e) => e.name)
      .sort();

    const out: KindRef[] = [];
    for (const name of names) {
      const slug = slugFromPath(name);
      if (slug === null || !Slug.safeParse(slug).success) continue; // not a valid artifact filename

      const ref = posix.join(kindDir, name);
      let title: string | undefined;
      try {
        const parsed = parse(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) title = titleOf(parsed.data);
      } catch {
        /* keep the filename-derived slug only */
      }
      out.push({ ref, slug, ...(title !== undefined ? { title } : {}) });
    }
    return out;
  }

  async listDecisions(): Promise<DecisionRef[]> {
    const refs = await this.listKind<Decision>(
      typeDirectoryFor('Decision'),
      parseDecisionYaml,
      (d) => d.spec.title,
    );
    // DecisionRef.title is required — a decision that fails to parse still
    // lists, falling back to its filename slug as the display title.
    return refs.map(({ ref, slug, title }) => ({ ref, slug, title: title ?? slug }));
  }

  async readDecision(ref: Ref): Promise<Decision> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseDecisionYaml(text);
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
