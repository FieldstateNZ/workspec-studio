// FsRepository — the standalone, filesystem-backed `TraceRepositoryPort`. It is
// the fs boundary `@workspec/trace-model` deliberately lacks: it walks the
// `.workspec/` tree under a root directory, parses each artifact's YAML,
// validates it against the matching `@workspec/req-schema` Zod schema, derives
// the slug from the FILENAME (`slugFromPath` — the file IS the identity, never
// a hand-written `metadata.slug`), and attaches the repo-relative source path so
// findings can point at it.
//
// Five kinds are loaded: actor, feature, user-requirement, system-requirement
// (a Gherkin Rule — no steps of its own, spec §4.4) and scenario (the fifth,
// file-native kind: the executed unit carrying the given/when/then steps,
// spec §4.5). `SystemRequirement` and `Scenario` both validate against their
// reshaped `@workspec/req-schema` schemas; the loader itself needs no kind-
// specific logic beyond another `loadKind` call site per kind.
//
// Validation failures are collected as `LoadIssue[]` and RETURNED, never thrown
// past the CLI boundary (mirrors `@workspec/cost-studio`'s
// `ArtifactValidationError`/`ParseIssue` handling) — so `verify` can surface a
// malformed file as an error and exit non-zero without the loader crashing.
// Every file access is constrained to the root via path-containment.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import {
  FILE_EXTENSION,
  Slug,
  WORKSPEC_DIR,
  slugFromPath,
  TYPE_DIRECTORIES as CORE_TYPE_DIRECTORIES,
} from '@workspec/schema-core';
import {
  ActorArtifact,
  FeatureArtifact,
  ScenarioArtifact,
  SystemRequirementArtifact,
  TestRun as TestRunSchema,
  TYPE_DIRECTORIES as REQ_TYPE_DIRECTORIES,
  UserRequirementArtifact,
} from '@workspec/req-schema';
import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  UserRequirement,
} from '@workspec/req-schema';
import type { Located, TestRun, TraceTree } from '@workspec/trace-model';
import type { LoadIssue, LoadedRuns, LoadedTree, TraceRepositoryPort } from './repository.js';
import { resolveWithinRoot } from './path-containment.js';

export { RefEscapesRootError } from './path-containment.js';

/** Default location of ingested runs (spec §4.5). Under `.workspec/`, so it is gitignore-able (spec §9.3). */
export const DEFAULT_RUNS_DIR = `${WORKSPEC_DIR}/.runs` as const;

/**
 * The `.workspec/<type-dir>` each kind's artifacts live under. Most are flat;
 * `UserRequirement`/`SystemRequirement` nest under `requirements/` (spec §4).
 * `Scenario` is flat, alongside `features` (req-schema's `TYPE_DIRECTORIES`).
 */
const KIND_DIRS = {
  Actor: `${WORKSPEC_DIR}/${CORE_TYPE_DIRECTORIES.Actor}`,
  Feature: `${WORKSPEC_DIR}/${REQ_TYPE_DIRECTORIES.Feature}`,
  UserRequirement: `${WORKSPEC_DIR}/${REQ_TYPE_DIRECTORIES.UserRequirement}`,
  SystemRequirement: `${WORKSPEC_DIR}/${REQ_TYPE_DIRECTORIES.SystemRequirement}`,
  Scenario: `${WORKSPEC_DIR}/${REQ_TYPE_DIRECTORIES.Scenario}`,
} as const;

/** One kind's loaded artifacts plus any problems the loader hit reading them. */
interface KindLoad<A> {
  located: Located<A>[];
  issues: LoadIssue[];
}

/** The one issue shape a Zod-style validation error surfaces. */
interface ValidationIssue {
  path: readonly PropertyKey[];
  message: string;
}

/**
 * The structural slice of a Zod schema the loader needs — just `safeParse`.
 * Typed structurally rather than importing `zod`, so trace-studio takes no
 * direct `zod` dependency (mirrors `@workspec/cost-studio`'s `fs-repository`,
 * which keeps its Zod handling structural too).
 */
interface ArtifactValidator<A> {
  safeParse(
    value: unknown,
  ): { success: true; data: A } | { success: false; error: { issues: readonly ValidationIssue[] } };
}

/** Best-effort 1-based line for a YAML parse error, when the parser attributed one. */
function parseErrorLine(error: unknown): number | undefined {
  return error instanceof YAMLParseError ? error.linePos?.[0]?.line : undefined;
}

/** Turn a validation error into one `LoadIssue` per issue, anchored at `file`. */
function zodIssues(file: string, error: { issues: readonly ValidationIssue[] }): LoadIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((p) => String(p)).join('.');
    return {
      file,
      kind: 'schema' as const,
      message: path.length > 0 ? `${path}: ${issue.message}` : issue.message,
    };
  });
}

export class FsRepository implements TraceRepositoryPort {
  readonly root: string;

  constructor(root: string = process.cwd()) {
    this.root = resolve(root);
  }

  /**
   * Absolute path for a repo-root-relative ref, throwing {@link RefEscapesRootError}
   * (re-exported from this module) when the ref would resolve outside `root`.
   */
  resolve(ref: string): string {
    return resolveWithinRoot(this.root, ref);
  }

  async loadTree(): Promise<LoadedTree> {
    const actors = await this.loadKind<Actor>(KIND_DIRS.Actor, ActorArtifact);
    const features = await this.loadKind<Feature>(KIND_DIRS.Feature, FeatureArtifact);
    const userRequirements = await this.loadKind<UserRequirement>(
      KIND_DIRS.UserRequirement,
      UserRequirementArtifact,
    );
    const systemRequirements = await this.loadKind<SystemRequirement>(
      KIND_DIRS.SystemRequirement,
      SystemRequirementArtifact,
    );
    const scenarios = await this.loadKind<Scenario>(KIND_DIRS.Scenario, ScenarioArtifact);

    const tree: TraceTree = {
      actors: actors.located,
      features: features.located,
      userRequirements: userRequirements.located,
      systemRequirements: systemRequirements.located,
      scenarios: scenarios.located,
    };
    return {
      tree,
      issues: [
        ...actors.issues,
        ...features.issues,
        ...userRequirements.issues,
        ...systemRequirements.issues,
        ...scenarios.issues,
      ],
    };
  }

  private async loadKind<A>(kindDir: string, schema: ArtifactValidator<A>): Promise<KindLoad<A>> {
    const located: Located<A>[] = [];
    const issues: LoadIssue[] = [];

    let entries;
    try {
      entries = await readdir(this.resolve(kindDir), { withFileTypes: true });
    } catch {
      return { located, issues }; // absent kind dir → no artifacts of this kind
    }

    const names = entries
      .filter((e) => e.isFile() && e.name.endsWith(FILE_EXTENSION))
      .map((e) => e.name)
      .sort();

    for (const name of names) {
      const ref = posix.join(kindDir, name);
      const slug = slugFromPath(name);

      // The file IS the identity — the filename stem must be a valid slug.
      if (slug === null || !Slug.safeParse(slug).success) {
        issues.push({
          file: ref,
          kind: 'filename',
          message: `filename "${name}" is not a valid slug (lowercase alphanumeric segments separated by single hyphens)`,
        });
        continue;
      }

      let raw: unknown;
      try {
        raw = parse(await readFile(this.resolve(ref), 'utf8'));
      } catch (error) {
        const line = parseErrorLine(error);
        issues.push({
          file: ref,
          kind: 'parse',
          message: `invalid YAML: ${(error as Error).message}`,
          ...(line !== undefined ? { line } : {}),
        });
        continue;
      }

      const validated = schema.safeParse(raw);
      if (!validated.success) {
        issues.push(...zodIssues(ref, validated.error));
        continue;
      }

      located.push({ slug, artifact: validated.data, source: { file: ref } });
    }

    return { located, issues };
  }

  async loadRuns(runsDir: string): Promise<LoadedRuns> {
    const runs: TestRun[] = [];
    const issues: LoadIssue[] = [];

    let entries;
    try {
      entries = await readdir(this.resolve(runsDir), { withFileTypes: true });
    } catch {
      return { runs, issues }; // absent runs dir → zero runs (verify before any run exists)
    }

    const names = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name)
      .sort();

    for (const name of names) {
      const ref = posix.join(runsDir, name);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(this.resolve(ref), 'utf8'));
      } catch (error) {
        issues.push({
          file: ref,
          kind: 'parse',
          message: `invalid JSON: ${(error as Error).message}`,
        });
        continue;
      }
      const validated = TestRunSchema.safeParse(raw);
      if (!validated.success) {
        issues.push(...zodIssues(ref, validated.error));
        continue;
      }
      runs.push(validated.data);
    }

    return { runs, issues };
  }

  async readFile(ref: string): Promise<string> {
    return readFile(this.resolve(ref), 'utf8');
  }

  async writeFile(ref: string, content: string): Promise<void> {
    const abs = this.resolve(ref);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
}
