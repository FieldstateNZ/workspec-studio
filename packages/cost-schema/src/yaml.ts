import { isNode, LineCounter, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import type { z, ZodTypeAny } from 'zod';
import { InventoryArtifact } from './inventory.js';
import { SpendArtifact } from './spend.js';
import { AttributionArtifact } from './attribution.js';
import { TagPlanArtifact } from './tagplan.js';
import type { Inventory } from './inventory.js';
import type { Spend } from './spend.js';
import type { Attribution } from './attribution.js';
import type { TagPlan } from './tagplan.js';

// YAML load helpers. Parse via the `yaml` package's Document API (which retains
// source ranges), validate with Zod, and on failure map each Zod issue path to
// a YAML line/column so callers (CLI `validate`, editors) can point at the
// offending token.

/** A single validation error, located in the source YAML. */
export interface ParseIssue {
  /** Dotted Zod issue path, e.g. "spec.rules.0.split.team". Empty for document-level (syntax) errors. */
  path: string;
  /** Human-readable message. */
  message: string;
  /** 1-based line in the source YAML. */
  line: number;
  /** 1-based column in the source YAML. */
  col: number;
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

function parseArtifact<S extends ZodTypeAny>(text: string, schema: S): ParseResult<z.infer<S>> {
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
      return {
        path: issue.path.join('.'),
        message: issue.message,
        line: pos.line,
        col: pos.col,
      };
    }),
  };
}

/** Parse and validate the text of a `*.inventory.yaml` file. */
export function parseInventoryYaml(text: string): ParseResult<Inventory> {
  return parseArtifact(text, InventoryArtifact);
}

/** Parse and validate the text of a `*.spend.yaml` file. */
export function parseSpendYaml(text: string): ParseResult<Spend> {
  return parseArtifact(text, SpendArtifact);
}

/** Parse and validate the text of a `*.attribution.yaml` file. */
export function parseAttributionYaml(text: string): ParseResult<Attribution> {
  return parseArtifact(text, AttributionArtifact);
}

/** Parse and validate the text of a `*.tagplan.yaml` file. */
export function parseTagPlanYaml(text: string): ParseResult<TagPlan> {
  return parseArtifact(text, TagPlanArtifact);
}
