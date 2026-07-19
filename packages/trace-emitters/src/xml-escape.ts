// XML text/attribute escaping — the one place the five XML-significant
// characters are escaped for the junit emitter's EMIT side (`junit-render.ts`)
// and reversed for its INGEST side (`junit.ts`, recovering a testcase's
// `name`/`classname` verbatim from a real toolchain's report). Pure string
// transforms only — no DOM API, no XML-parsing library dependency (this
// package ships no IO/DOM-dependent code, spec §3; `tsconfig.json` pins
// `types: []` so even Node's globals are unavailable here).

/** Escape order matters: `&` MUST run first, or escaping `<` to `&lt;` would
 * itself be re-escaped when `&` runs afterwards, corrupting the output. */
const ESCAPE_ENTRIES: readonly (readonly [RegExp, string])[] = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
  [/'/g, '&apos;'],
];

/**
 * Escape `&`, `<`, `>`, `"`, `'` for safe use in BOTH an XML attribute value
 * (double-quoted here, so `"` must escape) and element text content. Every
 * value `junit-render.ts` writes into a `.xml` file goes through this — a
 * scenario/Rule title or slug containing any of these renders safely and
 * round-trips exactly via {@link unescapeXmlEntities}.
 */
export function escapeXml(value: string): string {
  return ESCAPE_ENTRIES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    value,
  );
}

/**
 * Reverse {@link escapeXml} in a SINGLE regex pass — so a doubly-escaped
 * source like `&amp;lt;` decodes back to exactly `&lt;`, never all the way to
 * `<`. `junit.ts`'s `ingest` uses this to recover an attribute value's
 * original text from a raw XML report. Defensive: an entity this function
 * doesn't recognise is left untouched rather than throwing or dropping text.
 */
export function unescapeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (match, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return match;
    }
  });
}
