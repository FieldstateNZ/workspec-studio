// FsRepository — the standalone, filesystem-backed implementation of the C4
// `CostRepositoryPort`. Discovery is a per-kind DIRECTORY WALK of
// `.workspec/<type-dir>` (from `@workspec/cost-schema`'s `typeDirectoryFor`) —
// not a whole-tree recursive walk keyed off filename suffixes. Identity is the
// FILENAME: a `.workspec/<kind-dir>/<slug>.yaml` artifact's slug is derived
// from its filename via `slugFromPath` (`@workspec/schema-core`), the file IS
// the identity, mirroring `@workspec/trace-studio`'s `FsRepository`. Artifacts
// are read/validated through the schema's parse helpers and written back via
// the schema's byte-stable `serialize*Yaml` (the directive header is included
// by the serializer itself — unlike `@workspec/decision-studio`'s
// `FsRepository`, there is no comment-preserving patch step here: byte-stable
// serialization from the validated data IS the product contract for these
// artifacts).
//
// Refs are repo-root-relative POSIX paths (`.workspec/inventories/estate.yaml`)
// so they are stable and platform-independent. `read*`/`write*` accept any
// ref a caller supplies (they don't themselves enforce the `.workspec/<kind-
// dir>/` convention) — it is `list*` that only ever discovers artifacts
// actually filed under the matching type directory.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import {
  AttributionArtifact,
  InventoryArtifact,
  SpendArtifact,
  TagPlanArtifact,
  parseAttributionYaml,
  parseInventoryYaml,
  parseSpendYaml,
  parseTagPlanYaml,
  serializeAttributionYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
  serializeTagPlanYaml,
  typeDirectoryFor,
} from '@workspec/cost-schema';
import type {
  Attribution,
  AttributionRef,
  CostRepositoryPort,
  Inventory,
  InventoryRef,
  ParseIssue,
  ParseResult,
  Ref,
  Spend,
  SpendRef,
  TagPlan,
  TagPlanRef,
} from '@workspec/cost-schema';
import { resolveWithinRoot } from './path-containment.js';

export { RefEscapesRootError } from './path-containment.js';

/**
 * Thrown by `read*` when a file fails parse or schema validation, and by
 * `write*` when the in-memory artifact itself fails schema validation.
 * Carries the structured issues (each with a source line/col, when known) so
 * the CLI can print `ref:line:col: message` diagnostics.
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

function zodIssuesToParseIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): ParseIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    line: 0,
    col: 0,
  }));
}

/** One `list*` entry: the ref, its filename-derived slug, and `spec.name` when known. */
interface KindRef {
  ref: Ref;
  slug: string;
  name?: string;
}

/**
 * A repository backed by a directory tree of YAML artifacts.
 *
 * Construct with the root directory to scan (defaults to `process.cwd()`).
 * Implements the twelve-method {@link CostRepositoryPort}; the extra `root` /
 * `resolve` helpers are conveniences for the CLI and are not part of the port.
 */
export class FsRepository implements CostRepositoryPort {
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
   * silently skipped — the same tolerance the old suffix-filtered walk had
   * for unrelated files). `slug` is always the FILENAME-derived identity
   * (never a hand-written `metadata.slug`) — the file IS the identity, per
   * the `.workspec/<kind-dir>/<slug>.yaml` convention. `name` is a best-
   * effort read of `spec.name`: a file that fails to parse/validate still
   * lists (by its filename slug alone) so `validate` can find and report it.
   */
  private async listKind<T extends { spec: { name?: string | undefined } }>(
    kindDir: string,
    parse: (text: string) => ParseResult<T>,
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
      let artifactName: string | undefined;
      try {
        const parsed = parse(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) artifactName = parsed.data.spec.name;
      } catch {
        /* keep the filename-derived slug only */
      }
      out.push({ ref, slug, ...(artifactName !== undefined ? { name: artifactName } : {}) });
    }
    return out;
  }

  async listInventories(): Promise<InventoryRef[]> {
    return this.listKind<Inventory>(typeDirectoryFor('Inventory'), parseInventoryYaml);
  }

  async listSpends(): Promise<SpendRef[]> {
    return this.listKind<Spend>(typeDirectoryFor('Spend'), parseSpendYaml);
  }

  async listAttributions(): Promise<AttributionRef[]> {
    return this.listKind<Attribution>(typeDirectoryFor('Attribution'), parseAttributionYaml);
  }

  async listTagPlans(): Promise<TagPlanRef[]> {
    return this.listKind<TagPlan>(typeDirectoryFor('TagPlan'), parseTagPlanYaml);
  }

  async readInventory(ref: Ref): Promise<Inventory> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseInventoryYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readSpend(ref: Ref): Promise<Spend> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseSpendYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readAttribution(ref: Ref): Promise<Attribution> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseAttributionYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readTagPlan(ref: Ref): Promise<TagPlan> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseTagPlanYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async writeInventory(ref: Ref, inventory: Inventory): Promise<void> {
    const validated = InventoryArtifact.safeParse(inventory);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(ref, serializeInventoryYaml(validated.data));
  }

  async writeSpend(ref: Ref, spend: Spend): Promise<void> {
    const validated = SpendArtifact.safeParse(spend);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(ref, serializeSpendYaml(validated.data));
  }

  async writeAttribution(ref: Ref, attribution: Attribution): Promise<void> {
    const validated = AttributionArtifact.safeParse(attribution);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(ref, serializeAttributionYaml(validated.data));
  }

  async writeTagPlan(ref: Ref, tagPlan: TagPlan): Promise<void> {
    const validated = TagPlanArtifact.safeParse(tagPlan);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(ref, serializeTagPlanYaml(validated.data));
  }

  private async writeText(ref: Ref, text: string): Promise<void> {
    const abs = this.resolve(ref);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text, 'utf8');
  }
}
