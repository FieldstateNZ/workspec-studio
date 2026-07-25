// FsRepository — the standalone, filesystem-backed implementation of
// `@workspec/topology-schema`'s `TopologyRepositoryPort`. Discovery is a
// per-kind DIRECTORY WALK of `.workspec/<type-dir>` (from
// `@workspec/topology-schema`'s `typeDirectoryFor`) — a flat, non-recursive
// `readdir`, not a whole-tree walk keyed off filename suffixes. Identity is
// the FILENAME: a `.workspec/<kind-dir>/<slug>.yaml` artifact's slug is
// derived from its filename via `slugFromPath` (`@workspec/schema-core`),
// the file IS the identity — mirroring `@workspec/decision-studio`'s,
// `@workspec/cost-studio`'s, and `@workspec/trace-studio`'s `FsRepository`s.
//
// Writes go through `serializeArtifact` (`./serialize.js`), a
// comment-preserving patch step: Topology Studio's artifacts are
// hand-authored and re-edited through the UI, so an author's section
// comments must survive a round-trip — mirroring `@workspec/decision-studio`
// rather than `@workspec/cost-studio`'s byte-stable-from-scratch approach
// (whose artifacts are tool-generated, never hand-edited).
//
// Refs are repo-root-relative POSIX paths (`.workspec/resources/app-service.yaml`)
// so they are stable and platform-independent.
//
// This class is CRUD-only — the twelve `list*`/`read*`/`write*` methods plus
// the layout pair. The read-only, whole-tree MODEL (used by `validate`,
// `resolve`, `reconcile`, `cost`, `render`) is loaded through a completely
// separate path: `@workspec/topology-model/fs`'s `createFsSource`, reused
// (not reimplemented) via `createFileSource()` below and consumed by
// `load-authored-model.ts`. The two paths intentionally overlap in what they
// read from disk — one is per-artifact CRUD for the editor, the other is a
// whole-tree loader with cross-reference diagnostics for everything else.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import { createFsSource } from '@workspec/topology-model/fs';
import type { TopologyFileSource } from '@workspec/topology-model';
import {
  ENVIRONMENT_SCHEMA_DIRECTIVE,
  EnvironmentArtifact,
  parseEnvironmentYaml,
  layoutPathFor,
  Layout,
  parseLayoutYaml,
  parseResourceYaml,
  parseTopologyYaml,
  RESOURCE_SCHEMA_DIRECTIVE,
  ResourceArtifact,
  TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE,
  TOPOLOGY_SCHEMA_DIRECTIVE,
  TopologyArtifact,
  typeDirectoryFor,
} from '@workspec/topology-schema';
import type {
  Environment,
  EnvironmentRef,
  ParseIssue,
  ParseResult,
  Ref,
  Resource,
  ResourceRef,
  Topology,
  TopologyRef,
  TopologyRepositoryPort,
} from '@workspec/topology-schema';
import type { Layout as LayoutType } from '@workspec/topology-schema';
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
 * Implements the eleven-method {@link TopologyRepositoryPort}; the extra
 * `root` / `resolve` / `createFileSource` helpers are conveniences for the
 * CLI/server and are not part of the port.
 */
export class FsRepository implements TopologyRepositoryPort {
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
   * A `TopologyFileSource` rooted at the same directory this repository
   * serves, for the read-only whole-tree loader
   * (`@workspec/topology-model`'s `loadTopologyModel`). Reuses
   * `@workspec/topology-model/fs`'s `createFsSource` rather than
   * reimplementing tree discovery — see the module doc comment for why this
   * repository's own CRUD methods are a deliberately separate path.
   */
  createFileSource(): TopologyFileSource {
    return createFsSource(this.root);
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

  async listTopologies(): Promise<TopologyRef[]> {
    const refs = await this.listKind<Topology>(
      typeDirectoryFor('Topology'),
      parseTopologyYaml,
      (t) => t.spec.title,
    );
    // TopologyRef.title is required — a topology that fails to parse still
    // lists, falling back to its filename slug as the display title.
    return refs.map(({ ref, slug, title }) => ({ ref, slug, title: title ?? slug }));
  }

  async listResources(): Promise<ResourceRef[]> {
    const refs = await this.listKind<Resource>(
      typeDirectoryFor('Resource'),
      parseResourceYaml,
      (r) => r.spec.name,
    );
    return refs.map(({ ref, slug, title }) => ({ ref, slug, title: title ?? slug }));
  }

  async listEnvironments(): Promise<EnvironmentRef[]> {
    const refs = await this.listKind<Environment>(
      typeDirectoryFor('Environment'),
      parseEnvironmentYaml,
      () => undefined,
    );
    return refs.map(({ ref, slug }) => ({ ref, slug }));
  }

  async readTopology(ref: Ref): Promise<Topology> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseTopologyYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readResource(ref: Ref): Promise<Resource> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseResourceYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async readEnvironment(ref: Ref): Promise<Environment> {
    const text = await readFile(this.resolve(ref), 'utf8');
    const parsed = parseEnvironmentYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async writeTopology(ref: Ref, topology: Topology): Promise<void> {
    const validated = TopologyArtifact.safeParse(topology);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(
      ref,
      serializeArtifact(validated.data, TOPOLOGY_SCHEMA_DIRECTIVE, await this.readTextIfExists(ref)),
    );
  }

  async writeResource(ref: Ref, resource: Resource): Promise<void> {
    const validated = ResourceArtifact.safeParse(resource);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(
      ref,
      serializeArtifact(validated.data, RESOURCE_SCHEMA_DIRECTIVE, await this.readTextIfExists(ref)),
    );
  }

  async writeEnvironment(ref: Ref, environment: Environment): Promise<void> {
    const validated = EnvironmentArtifact.safeParse(environment);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(
      ref,
      serializeArtifact(validated.data, ENVIRONMENT_SCHEMA_DIRECTIVE, await this.readTextIfExists(ref)),
    );
  }

  async readLayout(topologySlug: string): Promise<LayoutType | undefined> {
    const ref = layoutPathFor(topologySlug);
    let text: string;
    try {
      text = await readFile(this.resolve(ref), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = parseLayoutYaml(text);
    if (!parsed.ok) throw new ArtifactValidationError(ref, parsed.errors);
    return parsed.data;
  }

  async writeLayout(topologySlug: string, layout: LayoutType): Promise<void> {
    const ref = layoutPathFor(topologySlug);
    const validated = Layout.safeParse(layout);
    if (!validated.success) {
      throw new ArtifactValidationError(ref, zodIssuesToParseIssues(validated.error));
    }
    await this.writeText(
      ref,
      serializeArtifact(
        validated.data,
        TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE,
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
