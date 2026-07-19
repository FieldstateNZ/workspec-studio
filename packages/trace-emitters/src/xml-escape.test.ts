import { describe, expect, it } from 'vitest';
import { escapeXml, unescapeXmlEntities } from './xml-escape.js';

describe('escapeXml', () => {
  it('escapes all five XML-significant characters', () => {
    expect(escapeXml('&')).toBe('&amp;');
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('>')).toBe('&gt;');
    expect(escapeXml('"')).toBe('&quot;');
    expect(escapeXml("'")).toBe('&apos;');
  });

  it('escapes & FIRST so its own output is never re-escaped', () => {
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('Inline element creation')).toBe('Inline element creation');
  });

  it('escapes a value carrying every special character at once', () => {
    expect(escapeXml(`<a href="x"> & 'y'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt; &amp; &apos;y&apos;',
    );
  });
});

describe('unescapeXmlEntities', () => {
  it('reverses each of the five entities', () => {
    expect(unescapeXmlEntities('&amp;')).toBe('&');
    expect(unescapeXmlEntities('&lt;')).toBe('<');
    expect(unescapeXmlEntities('&gt;')).toBe('>');
    expect(unescapeXmlEntities('&quot;')).toBe('"');
    expect(unescapeXmlEntities('&apos;')).toBe("'");
  });

  it('decodes in a SINGLE pass — a doubly-escaped source does not over-decode', () => {
    // escapeXml('&lt;') === '&amp;lt;' — reversing it must yield '&lt;', not '<'.
    expect(unescapeXmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('leaves an unrecognised entity untouched rather than throwing', () => {
    expect(unescapeXmlEntities('&nbsp;')).toBe('&nbsp;');
    expect(unescapeXmlEntities('& not an entity')).toBe('& not an entity');
  });

  it('round-trips every value escapeXml produces', () => {
    const original = `<title> & "quoted" 'text'`;
    expect(unescapeXmlEntities(escapeXml(original))).toBe(original);
  });
});
