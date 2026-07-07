// Comment-preserving YAML serialization for artifact writes.
//
// The naive `stringify(data)` throws away every comment an author wrote. Instead
// we parse the existing file into a `yaml` Document (which retains comments and
// node styles), then *patch the new values into it in place* — reusing scalar
// nodes (so their comments and flow/block style survive) and appending only
// genuinely new keys. Where the shape diverges (a new array element, a changed
// node kind) fresh nodes are created; comments there are simply absent. When no
// prior file exists we emit a fresh document.
//
// Every write is prefixed with the canonical `# yaml-language-server` directive
// so editors keep IntelliSense; any pre-existing directive is stripped first so
// it is never duplicated.

import { Document, isMap, isScalar, isSeq, Pair, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import type { Node } from 'yaml';

function keyString(key: unknown): string {
  if (isScalar(key)) return String(key.value);
  return String(key);
}

/**
 * Return a node representing `next`, reusing `prev`'s node (and thus its
 * comments/style) wherever the shapes line up. Pure w.r.t. `next`; mutates
 * reused nodes from `prev` in place.
 */
function patch(prev: Node | null | undefined, next: unknown, doc: Document): Node {
  // Scalars and null.
  if (next === null || typeof next !== 'object') {
    if (isScalar(prev)) {
      prev.value = next;
      return prev;
    }
    return doc.createNode(next) as Node;
  }

  // Sequences.
  if (Array.isArray(next)) {
    const seq = isSeq(prev) ? prev : new YAMLSeq();
    const prevItems = isSeq(prev) ? (prev.items as Node[]) : [];
    seq.items = next.map((value, index) => patch(prevItems[index] ?? null, value, doc));
    return seq;
  }

  // Maps. Preserve the prior key order for keys that still exist, then append
  // any genuinely new keys in `next` order — minimal churn, comments intact.
  const record = next as Record<string, unknown>;
  const nextKeys = Object.keys(record);
  const prevPairs = isMap(prev) ? (prev.items as Pair[]) : [];
  const prevByKey = new Map<string, Pair>();
  for (const pair of prevPairs) prevByKey.set(keyString(pair.key), pair);

  const orderedKeys = [
    ...prevPairs.map((p) => keyString(p.key)).filter((k) => nextKeys.includes(k)),
    ...nextKeys.filter((k) => !prevByKey.has(k)),
  ];

  const map = isMap(prev) ? prev : new YAMLMap();
  map.items = orderedKeys.map((key) => {
    const existing = prevByKey.get(key);
    const valueNode = patch(existing?.value as Node | undefined, record[key], doc);
    if (existing) {
      existing.value = valueNode;
      return existing;
    }
    return new Pair(doc.createNode(key), valueNode);
  });
  return map;
}

function stripDirective(text: string): string {
  return text.replace(/^# yaml-language-server:.*\r?\n/gm, '').replace(/^\s*\n+/, '');
}

/**
 * Serialize `data` to YAML text, preserving the comments and node styles of
 * `existingText` where the shapes align, and prefixing `directive` (a full
 * `# yaml-language-server: …\n` header). Pass `existingText = undefined` to emit
 * a fresh document.
 */
export function serializeArtifact(data: unknown, directive: string, existingText?: string): string {
  let doc: Document;
  if (existingText !== undefined && existingText.trim().length > 0) {
    doc = parseDocument(existingText);
    doc.contents = patch(doc.contents as Node | null, data, doc);
    // Drop any leading comment (e.g. the old directive) so it is not duplicated.
    doc.commentBefore = null;
  } else {
    doc = new Document(data);
  }
  const body = stripDirective(doc.toString({ lineWidth: 0 }));
  return `${directive}${body}`;
}
