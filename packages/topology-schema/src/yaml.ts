import { isNode, LineCounter, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import type { z } from 'zod';
import { TopologyArtifact } from './topology.js';
import { ResourceArtifact } from './resource.js';
import { EnvironmentArtifact } from './environment.js';
import { Layout } from './schemas/layout/layout.js';
import type { Topology } from './topology.js';
import type { Resource } from './resource.js';
import type { Environment } from './environment.js';
import type { Layout as LayoutType } from './schemas/layout/layout.js';

// YAML load helpers. Parse via the `yaml` package's Document API (which retains
// source ranges), validate with Zod, and on failure map each Zod issue path to
// a YAML line/column so callers (CLI `validate`, editors) can point at the
// offending token. Mirrors `@workspec/decision-schema`'s `yaml.ts` exactly.

/** A single validation error, located in the source YAML. */
export interface ParseIssue {
  /** Dotted Zod issue path, e.g. "spec.connections.0.environments.1". Empty for document-level (syntax) errors. */
  path: string;
  /** Human-readable message. */
  message: string;
  /** 1-based line in the source YAML. */
  line: number;
  /** 1-based column in the source YAML. */
  col: number;
  /**
   * Distinguishing code for the handful of custom (`z.ZodIssueCode.custom`)
   * issues that stamp one via `ctx.addIssue({..., params: {code}})` — e.g.
   * `environment.ts`'s `LEGACY_ENVIRONMENT_OVERRIDES_ISSUE_CODE` — so a
   * consumer like `@workspec/topology-model`'s `parseIssuesToDiagnostics` can
   * map that ONE issue onto a dedicated diagnostic code instead of the
   * generic `parse-error` every other schema-validation issue gets. Absent
   * for ordinary issues (wrong type, out of range, unknown enum value, …).
   */
  code?: string;
}

/** Result of parsing + validating an artifact. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: ParseIssue[] };

/**
 * Walk up the issue path until a source node is found, returning its start
 * line/col. A missing (required) field has no node of its own, so we fall back
 * to the nearest enclosing node (its parent map/seq) — an approximate but
 * useful location.
 */
function locate(
  doc: Document.Parsed,
  lineCounter: LineCounter,
  path: readonly PropertyKey[],
): { line: number; col: number } {
  const segments = path.slice();
  while (segments.length > 0) {
    const node = doc.getIn(segments as unknown[], true);
    if (isNode(node) && node.range) {
      const pos = lineCounter.linePos(node.range[0]);
      return { line: pos.line, col: pos.col };
    }
    segments.pop();
  }
  if (isNode(doc.contents) && doc.contents.range) {
    const pos = lineCounter.linePos(doc.contents.range[0]);
    return { line: pos.line, col: pos.col };
  }
  return { line: 1, col: 1 };
}

/** Extracts a stamped `params.code` off a custom Zod issue, if present (see `ParseIssue.code`). */
function issueCode(issue: z.ZodIssue): string | undefined {
  if (issue.code !== 'custom') return undefined;
  const code = issue.params?.['code'];
  return typeof code === 'string' ? code : undefined;
}

function parseArtifact<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true });

  // YAML syntax errors — surface before attempting schema validation.
  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((err) => {
        const offset = err.pos?.[0] ?? 0;
        const pos = lineCounter.linePos(offset);
        return { path: '', message: err.message, line: pos.line, col: pos.col };
      }),
    };
  }

  const js = doc.toJS();
  const result = schema.safeParse(js);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const pos = locate(doc, lineCounter, issue.path);
      const code = issueCode(issue);
      return {
        path: issue.path.join('.'),
        message: issue.message,
        line: pos.line,
        col: pos.col,
        ...(code !== undefined ? { code } : {}),
      };
    }),
  };
}

/** Parse and validate the text of a `.workspec/topologies/<slug>.yaml` file. */
export function parseTopologyYaml(text: string): ParseResult<Topology> {
  return parseArtifact(text, TopologyArtifact);
}

/** Parse and validate the text of a `.workspec/resources/<slug>.yaml` file. */
export function parseResourceYaml(text: string): ParseResult<Resource> {
  return parseArtifact(text, ResourceArtifact);
}

/** Parse and validate the text of a `.workspec/environments/<slug>.yaml` file. */
export function parseEnvironmentYaml(text: string): ParseResult<Environment> {
  return parseArtifact(text, EnvironmentArtifact);
}

/**
 * Parse and validate the text of a `.workspec/topologies/.layout/<slug>.yaml`
 * file. Mirrors `@workspec/c4-schema`'s `parseLayoutYaml`, reusing this
 * package's own line/col-mapped `parseArtifact` rather than a bare
 * `safeParse`, since layout files are hand-edited too.
 */
export function parseLayoutYaml(text: string): ParseResult<LayoutType> {
  return parseArtifact(text, Layout);
}
