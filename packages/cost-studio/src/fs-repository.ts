// FsRepository — the standalone, filesystem-backed implementation of the C4
// `CostRepositoryPort`. It discovers `*.inventory.yaml` / `*.spend.yaml` /
// `*.attribution.yaml` / `*.tagplan.yaml` artifacts by a manual recursive walk
// of a root directory (no glob dependency), reads them through the schema's
// parse+validate helpers, and writes them back via the schema's byte-stable
// `serialize*Yaml` (the directive header is included by the serializer
// itself — unlike `@workspec/decision-studio`'s `FsRepository`, there is no
// comment-preserving patch step here: byte-stable serialization from the
// validated data IS the product contract for these artifacts).
//
// Refs are repo-root-relative POSIX paths (`prod/estate.inventory.yaml`) so
// they are stable and platform-independent.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import {
  AttributionArtifact,
  INVENTORY_FILE_SUFFIX,
  InventoryArtifact,
  SPEND_FILE_SUFFIX,
  SpendArtifact,
  ATTRIBUTION_FILE_SUFFIX,
  TAGPLAN_FILE_SUFFIX,
  TagPlanArtifact,
  isAttributionFile,
  isInventoryFile,
  isSpendFile,
  isTagPlanFile,
  parseAttributionYaml,
  parseInventoryYaml,
  parseSpendYaml,
  parseTagPlanYaml,
  serializeAttributionYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
  serializeTagPlanYaml,
} from '@workspec/cost-schema';
import type {
  Attribution,
  AttributionRef,
  CostRepositoryPort,
  Inventory,
  InventoryRef,
  ParseIssue,
  Ref,
  Spend,
  SpendRef,
  TagPlan,
  TagPlanRef,
} from '@workspec/cost-schema';

/** Directories never descended into during discovery. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

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
      if (
        isInventoryFile(entry.name) ||
        isSpendFile(entry.name) ||
        isAttributionFile(entry.name) ||
        isTagPlanFile(entry.name)
      ) {
        onFile(full);
      }
    }
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

  /** Absolute filesystem path for a repo-root-relative ref. */
  resolve(ref: Ref): string {
    return isAbsolute(ref) ? ref : resolve(this.root, ref);
  }

  private async discover(): Promise<{
    inventories: Ref[];
    spends: Ref[];
    attributions: Ref[];
    tagPlans: Ref[];
  }> {
    const inventories: Ref[] = [];
    const spends: Ref[] = [];
    const attributions: Ref[] = [];
    const tagPlans: Ref[] = [];
    await walk(this.root, (abs) => {
      const ref = toPosixRef(this.root, abs);
      if (isInventoryFile(abs)) inventories.push(ref);
      else if (isSpendFile(abs)) spends.push(ref);
      else if (isAttributionFile(abs)) attributions.push(ref);
      else if (isTagPlanFile(abs)) tagPlans.push(ref);
    });
    inventories.sort();
    spends.sort();
    attributions.sort();
    tagPlans.sort();
    return { inventories, spends, attributions, tagPlans };
  }

  async listInventories(): Promise<InventoryRef[]> {
    const { inventories } = await this.discover();
    const out: InventoryRef[] = [];
    for (const ref of inventories) {
      let id = posix.basename(ref).replace(new RegExp(`\\${INVENTORY_FILE_SUFFIX}$`), '');
      let name: string | undefined;
      try {
        const parsed = parseInventoryYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          name = parsed.data.metadata.name;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(name !== undefined ? { ref, id, name } : { ref, id });
    }
    return out;
  }

  async listSpends(): Promise<SpendRef[]> {
    const { spends } = await this.discover();
    const out: SpendRef[] = [];
    for (const ref of spends) {
      let id = posix.basename(ref).replace(new RegExp(`\\${SPEND_FILE_SUFFIX}$`), '');
      let name: string | undefined;
      try {
        const parsed = parseSpendYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          name = parsed.data.metadata.name;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(name !== undefined ? { ref, id, name } : { ref, id });
    }
    return out;
  }

  async listAttributions(): Promise<AttributionRef[]> {
    const { attributions } = await this.discover();
    const out: AttributionRef[] = [];
    for (const ref of attributions) {
      let id = posix.basename(ref).replace(new RegExp(`\\${ATTRIBUTION_FILE_SUFFIX}$`), '');
      let name: string | undefined;
      try {
        const parsed = parseAttributionYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          name = parsed.data.metadata.name;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(name !== undefined ? { ref, id, name } : { ref, id });
    }
    return out;
  }

  async listTagPlans(): Promise<TagPlanRef[]> {
    const { tagPlans } = await this.discover();
    const out: TagPlanRef[] = [];
    for (const ref of tagPlans) {
      let id = posix.basename(ref).replace(new RegExp(`\\${TAGPLAN_FILE_SUFFIX}$`), '');
      let name: string | undefined;
      try {
        const parsed = parseTagPlanYaml(await readFile(this.resolve(ref), 'utf8'));
        if (parsed.ok) {
          id = parsed.data.metadata.id;
          name = parsed.data.metadata.name;
        }
      } catch {
        /* keep filename-derived id */
      }
      out.push(name !== undefined ? { ref, id, name } : { ref, id });
    }
    return out;
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
