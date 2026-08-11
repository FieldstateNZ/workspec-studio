// Surgical YAML edits applied to the SOURCE TEXT, not to a re-serialized
// document.
//
// WHY THIS EXISTS. The obvious implementation — mutate the parsed
// `Document` and call `doc.toString()` — re-emits the WHOLE file through
// `yaml`'s printer, and that printer is not a formatting-preserving
// round-trip. On this repo's own `container.yaml` a pure parse→stringify
// with zero mutations already differs from the input: plain scalars longer
// than `lineWidth` (default 80) get wrapped, and folded (`>`) block scalars
// get re-folded at the printer's width rather than the author's. Deleting
// one edge therefore reflowed unrelated prose several lines away. No
// combination of `lineWidth` / `blockQuote` / `minContentWidth` fixes it:
// `lineWidth: 0` stops the wrapping but collapses every folded scalar onto
// one line instead. The `yaml` Document API simply does not retain source
// formatting on stringify.
//
// So mutations are expressed as declarative {@link YamlSourceEdit}s,
// resolved against the ORIGINAL parse's node ranges, and applied as byte
// splices over the original text. Everything the edit does not name is
// copied verbatim — comments, blank lines, key order, hand-wrapped prose,
// line endings — which is the "clean, minimal git diff" half of #132's
// acceptance criteria, now by construction rather than by hope.
//
// Newly emitted content uses the same `{ lineWidth: 0 }` option set as
// `aspire/serialize.ts` and `serialize-new-element.ts`, so what this module
// writes never varies across environments and never re-wraps later.

import { isMap, stringify } from 'yaml';
import type { Document, Node, YAMLMap } from 'yaml';
import { applySplices } from './source-splice.js';
import type { Splice } from './source-splice.js';
import {
  blankPrefix,
  blockSeqAt,
  entryOf,
  indentBlock,
  lineEndOf,
  lineStartOf,
  linePrefixAt,
  rootMap,
} from './yaml-source-anchor.js';

/** Emission options for NEW content — the package-wide byte-stable set. */
const YAML_OPTIONS = { lineWidth: 0 } as const;

/**
 * One declarative edit against a document's root mapping. `seq` names a
 * top-level block sequence (`nodes`, `edges`); `index` is an index into
 * that sequence as the schema-validated data view sees it — the two are
 * index-aligned because both come from parsing the same text.
 */
export type YamlSourceEdit =
  /** Drop `seq[index]`, including its `- ` bullet line and continuations. */
  | { readonly op: 'remove-item'; readonly seq: string; readonly index: number }
  /** Append an item to `seq`, creating the sequence when it is absent or empty. */
  | { readonly op: 'append-item'; readonly seq: string; readonly value: unknown }
  /** Set `key` inside `seq[index]`, adding the line when the key is absent. */
  | {
      readonly op: 'set-item-field';
      readonly seq: string;
      readonly index: number;
      readonly key: string;
      readonly value: unknown;
    }
  /** Drop `key` from `seq[index]`. A no-op when the key is already absent. */
  | {
      readonly op: 'remove-item-field';
      readonly seq: string;
      readonly index: number;
      readonly key: string;
    }
  /** Set a root-level `key`, appending it at the end when absent. */
  | { readonly op: 'set-field'; readonly key: string; readonly value: unknown }
  /** Drop a root-level `key`. A no-op when already absent. */
  | { readonly op: 'remove-field'; readonly key: string };

function rangeOf(node: {
  readonly range?: readonly [number, number, number] | null;
}): readonly [number, number, number] {
  if (node.range === undefined || node.range === null) {
    throw new Error('YAML node has no source range: `doc` must be an unmutated parse of `source`');
  }
  return node.range;
}

/** Re-attaches a value's trailing `# comment` to the first line of new text. */
function withTrailingComment(body: string, comment: string | null | undefined): string {
  if (comment === undefined || comment === null || comment === '') return body;
  const newline = body.indexOf('\n');
  if (newline === -1) return `${body} #${comment}`;
  return `${body.slice(0, newline)} #${comment}${body.slice(newline)}`;
}

/** Guarantees inserted text begins on a line of its own. */
function atLineStart(source: string, offset: number, text: string): string {
  return offset > 0 && source[offset - 1] !== '\n' ? `\n${text}` : text;
}

/** The item map at `seq[index]`, or a thrown error when it is not a mapping. */
function itemMapAt(doc: Document, seqKey: string, index: number): YAMLMap {
  const seq = blockSeqAt(rootMap(doc), seqKey);
  const item = seq?.items[index];
  if (item === undefined || !isMap(item)) {
    throw new Error(
      `no mapping at ${seqKey}[${String(index)}] — index resolved against a stale parse`,
    );
  }
  return item;
}

/** Replace-or-insert one `key: value` entry of `map`, as whole lines. */
function setEntrySplice(
  source: string,
  map: YAMLMap,
  key: string,
  value: unknown,
  fallback: { readonly offset: number; readonly indent: string },
): Splice {
  const body = stringify({ [key]: value }, YAML_OPTIONS);
  const entry = entryOf(map, key);
  if (entry === null) {
    const text = atLineStart(source, fallback.offset, indentBlock(body, fallback.indent));
    return { start: fallback.offset, end: fallback.offset, text };
  }
  const keyStart = lineStartOf(source, rangeOf(entry.key)[0]);
  const end = lineEndOf(source, rangeOf(entry.value ?? entry.key)[2]);
  const indent = linePrefixAt(source, rangeOf(entry.key)[0]);
  const commented = withTrailingComment(
    body,
    (entry.value as { comment?: string } | null)?.comment,
  );
  const indented = indentBlock(commented, indent);
  // A final entry on an unterminated last line must stay unterminated.
  const text = source.slice(keyStart, end).endsWith('\n') ? indented : indented.replace(/\n$/, '');
  return { start: keyStart, end, text };
}

/** Delete one `key: value` entry of `map`, as whole lines. Null when absent. */
function removeEntrySplice(source: string, map: YAMLMap, key: string): Splice | null {
  const entry = entryOf(map, key);
  if (entry === null) return null;
  return {
    start: lineStartOf(source, rangeOf(entry.key)[0]),
    end: lineEndOf(source, rangeOf(entry.value ?? entry.key)[2]),
    text: '',
  };
}

/** Append an item to a block sequence, or (re)write the whole key otherwise. */
function appendItemSplice(source: string, doc: Document, seqKey: string, value: unknown): Splice {
  const map = rootMap(doc);
  const seq = blockSeqAt(map, seqKey);
  if (seq === null) {
    // Absent, empty (`nodes:` / `nodes: []`) or flow-style: there is no block
    // item to anchor to, so the key is emitted whole. Existing flow items are
    // carried over rather than dropped — the result is the canonical block
    // form, which is what the schema's own writers produce.
    const entry = entryOf(map, seqKey);
    const existing = (entry?.value as { toJSON?: () => unknown })?.toJSON?.();
    const items = Array.isArray(existing) ? existing : [];
    return setEntrySplice(source, map, seqKey, [...items, value], {
      offset: source.length,
      indent: '',
    });
  }
  const dashIndent = linePrefixAt(source, rangeOf(seq)[0]);
  const bullet = `${dashIndent}- `;
  const continuation = blankPrefix(bullet);
  const body = indentBlock(stringify(value, YAML_OPTIONS), continuation);
  const lastItem = seq.items[seq.items.length - 1] as Node;
  const offset = lineEndOf(source, rangeOf(lastItem)[2]);
  const text = atLineStart(source, offset, bullet + body.slice(continuation.length));
  return { start: offset, end: offset, text };
}

function spliceFor(source: string, doc: Document, edit: YamlSourceEdit): Splice | null {
  switch (edit.op) {
    case 'remove-item': {
      const seq = blockSeqAt(rootMap(doc), edit.seq);
      const item = seq?.items[edit.index] as Node | undefined;
      if (item === undefined) {
        throw new Error(
          `no item at ${edit.seq}[${String(edit.index)}] — index resolved against a stale parse`,
        );
      }
      const range = rangeOf(item);
      return { start: lineStartOf(source, range[0]), end: lineEndOf(source, range[2]), text: '' };
    }
    case 'append-item':
      return appendItemSplice(source, doc, edit.seq, edit.value);
    case 'set-item-field': {
      const item = itemMapAt(doc, edit.seq, edit.index);
      const range = rangeOf(item);
      return setEntrySplice(source, item, edit.key, edit.value, {
        offset: lineEndOf(source, range[2]),
        indent: blankPrefix(linePrefixAt(source, range[0])),
      });
    }
    case 'remove-item-field':
      return removeEntrySplice(source, itemMapAt(doc, edit.seq, edit.index), edit.key);
    case 'set-field':
      return setEntrySplice(source, rootMap(doc), edit.key, edit.value, {
        offset: source.length,
        indent: '',
      });
    case 'remove-field':
      return removeEntrySplice(source, rootMap(doc), edit.key);
  }
}

/**
 * Applies `edits` to `source`, returning the new text.
 *
 * `doc` MUST be `parseDocument(source)` and must not have been mutated —
 * every offset comes from its nodes, so a mutated document would resolve
 * ranges that no longer describe `source`. Edits are resolved against that
 * one parse and then applied together, so their indexes never shift under
 * one another (unlike `Document.deleteIn`, which needs descending order).
 *
 * Throws only for caller bugs (an index that does not exist, a root that is
 * not a mapping, overlapping edits). Those are impossible for a service
 * that computed its indexes from the same parse, so they surface as the
 * generic 500 rather than as an expected `MutationResult` failure.
 */
export function applyYamlSourceEdits(
  source: string,
  doc: Document,
  edits: readonly YamlSourceEdit[],
): string {
  const splices: Splice[] = [];
  for (const edit of edits) {
    const splice = spliceFor(source, doc, edit);
    if (splice !== null) splices.push(splice);
  }
  return applySplices(source, splices);
}
