// Line/indent anchoring for surgical YAML source edits. Every helper here
// maps a parsed `yaml` node's offset range onto the WHOLE LINES it occupies
// in the original text, which is the unit a `git diff` reports and therefore
// the unit `yaml-source-edit.ts` edits in.

import { isMap, isPair, isSeq } from 'yaml';
import type { Document, Node, Pair, YAMLMap, YAMLSeq } from 'yaml';

/** Offset of the first character of the line containing `offset`. */
export function lineStartOf(source: string, offset: number): number {
  if (offset <= 0) return 0;
  const newline = source.lastIndexOf('\n', offset - 1);
  return newline === -1 ? 0 : newline + 1;
}

/**
 * Normalises a node's end offset to a line boundary. Node ranges are
 * inconsistent about the terminator — a scalar's range usually swallows its
 * newline, an EMPTY block value (`nodes:` with nothing under it) stops on
 * the colon — so every edit normalises through here and then decides about
 * trailing newlines exactly once.
 *
 * An offset that is ALREADY at a line boundary is returned untouched. That
 * guard is load-bearing: without it a node ending in `\n` would swallow the
 * blank line an author left after it, so deleting one edge also deleted the
 * paragraph break below it.
 */
export function lineEndOf(source: string, end: number): number {
  if (end <= 0 || source[end - 1] === '\n') return end;
  const newline = source.indexOf('\n', end);
  if (newline === -1) return end;
  return source.slice(end, newline).trim() === '' ? newline + 1 : end;
}

/**
 * The literal text between the start of `offset`'s line and `offset` — the
 * indent for a map key, or the `  - ` bullet for a sequence item.
 */
export function linePrefixAt(source: string, offset: number): string {
  return source.slice(lineStartOf(source, offset), offset);
}

/**
 * The same prefix with every non-tab character blanked, so continuation
 * lines of a sequence item align under its first key (`  - ` → `    `).
 * Tabs are preserved as tabs so a tab-indented file stays tab-indented.
 */
export function blankPrefix(prefix: string): string {
  return prefix.replace(/[^\t]/g, ' ');
}

/** Indents every non-empty line of `text` by `prefix`. */
export function indentBlock(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : prefix + line))
    .join('\n');
}

/** The document's root map, or a thrown error if the file is not a mapping. */
export function rootMap(doc: Document): YAMLMap {
  const contents = doc.contents;
  if (!isMap(contents)) throw new Error('expected a YAML mapping at the document root');
  return contents;
}

/** The `key` entry of `map`, or `null` when the key is absent. */
export function entryOf(map: YAMLMap, key: string): Pair<Node, Node> | null {
  for (const item of map.items) {
    if (isPair(item) && (item.key as { value?: unknown }).value === key) {
      return item as Pair<Node, Node>;
    }
  }
  return null;
}

/** The block sequence at `key`, or `null` when absent, empty, or flow-style. */
export function blockSeqAt(map: YAMLMap, key: string): YAMLSeq<Node> | null {
  const entry = entryOf(map, key);
  if (entry === null || !isSeq(entry.value) || entry.value.flow) return null;
  return entry.value.items.length > 0 ? (entry.value as YAMLSeq<Node>) : null;
}
