import { describe, expect, it } from 'vitest';
import { junitEmitter } from './junit.js';
import type { RunMeta } from './types.js';

const META: RunMeta = { id: '2026-07-09T02-14Z', ts: '2026-07-09T02:14:07Z' };

function ingest(raw: unknown) {
  return junitEmitter.ingest(raw, META);
}

/** A well-formed `<testsuite>` XML document wrapping the given raw `<testcase>` blocks. */
function report(...testcases: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="x" tests="${testcases.length}">${testcases.join('')}</testsuite>`;
}

function passingCase(slug: string, classname = 'x'): string {
  return `<testcase classname="${classname}" name="${slug}"/>`;
}

function failingCase(slug: string, classname = 'x'): string {
  return `<testcase classname="${classname}" name="${slug}"><failure message="boom"/></testcase>`;
}

function erroringCase(slug: string, classname = 'x'): string {
  return `<testcase classname="${classname}" name="${slug}"><error message="boom"/></testcase>`;
}

function skippedCase(slug: string, classname = 'x'): string {
  return `<testcase classname="${classname}" name="${slug}"><skipped/></testcase>`;
}

describe('junitEmitter.ingest — verdict mapping', () => {
  it('a self-closing testcase (no children) → pass', () => {
    expect(ingest(report(passingCase('a'))).results).toEqual({ a: 'pass' });
  });

  it('a non-self-closing testcase with no failure/error/skipped child → pass', () => {
    expect(
      ingest(report('<testcase name="a" classname="x"><system-out>ok</system-out></testcase>'))
        .results,
    ).toEqual({ a: 'pass' });
  });

  it('a <failure> child → fail', () => {
    expect(ingest(report(failingCase('a'))).results.a).toBe('fail');
  });

  it('an <error> child → fail', () => {
    expect(ingest(report(erroringCase('b'))).results.b).toBe('fail');
  });

  it('a <skipped> child (no failure/error) → skip', () => {
    expect(ingest(report(skippedCase('a'))).results.a).toBe('skip');
  });

  it('both a <failure> and a <skipped> child → fail wins', () => {
    const el = '<testcase name="a" classname="x"><skipped/><failure message="boom"/></testcase>';
    expect(ingest(report(el)).results.a).toBe('fail');
  });
});

describe('junitEmitter.ingest — outline rows fold to one verdict per slug', () => {
  it('fail dominates: any failing row makes the slug fail', () => {
    const r = ingest(report(passingCase('out'), failingCase('out')));
    expect(r.results.out).toBe('fail');
  });

  it('skip dominates pass: a passing + a skipping row → skip', () => {
    const r = ingest(report(passingCase('out'), skippedCase('out')));
    expect(r.results.out).toBe('skip');
  });

  it('all rows passing → pass', () => {
    const r = ingest(report(passingCase('out'), passingCase('out')));
    expect(r.results.out).toBe('pass');
  });
});

describe('junitEmitter.ingest — slug recovery + defensiveness', () => {
  it('keys on the name attribute, sorted', () => {
    const r = ingest(report(passingCase('zeta'), failingCase('alpha')));
    expect(Object.keys(r.results)).toEqual(['alpha', 'zeta']);
  });

  it('recovers "name" and does not collide with "classname" (word-boundary match)', () => {
    const el = '<testcase classname="rule-slug-with-name-inside" name="my-scenario"/>';
    expect(Object.keys(ingest(report(el)).results)).toEqual(['my-scenario']);
  });

  it('supports single-quoted attribute values', () => {
    const el = `<testcase classname='x' name='my-scenario'/>`;
    expect(Object.keys(ingest(report(el)).results)).toEqual(['my-scenario']);
  });

  it('unescapes XML entities in the recovered name', () => {
    const el = '<testcase classname="x" name="a&amp;b"/>';
    expect(Object.keys(ingest(report(el)).results)).toEqual(['a&b']);
  });

  it('ignores a testcase with no name attribute (mirrors cucumber ignoring an untagged element)', () => {
    const untagged = '<testcase classname="x"/>';
    expect(ingest(report(untagged)).results).toEqual({});
  });

  it('ignores a testcase with an empty name attribute', () => {
    const emptyName = '<testcase classname="x" name=""/>';
    expect(ingest(report(emptyName)).results).toEqual({});
  });

  it('treats an unterminated (malformed) testcase leniently as skip, not pass', () => {
    const truncated = '<?xml version="1.0"?><testsuite><testcase classname="x" name="a">';
    expect(ingest(truncated).results.a).toBe('skip');
  });

  it('a mid-document unterminated testcase does not bleed into the next one', () => {
    // A is missing its OWN </testcase> — the only </testcase> literal in the
    // document actually belongs to B. Without a nesting check, a naive
    // indexOf('</testcase>') scan would swallow B's <failure/> into A's body
    // (falsely failing a clean testcase) AND drop B entirely (no key).
    const xml =
      '<testsuite><testcase name="A" classname="x">' +
      '<testcase name="B" classname="y"><failure/></testcase></testsuite>';
    const r = ingest(xml).results;
    expect(r).toEqual({ A: 'skip', B: 'fail' });
  });

  it('a 3-testcase report with the middle one unterminated parses A and C independently', () => {
    const xml =
      '<testsuite>' +
      '<testcase name="A" classname="x"/>' +
      '<testcase name="B" classname="y">' +
      '<testcase name="C" classname="z"><failure/></testcase>' +
      '</testsuite>';
    const r = ingest(xml).results;
    expect(r).toEqual({ A: 'pass', B: 'skip', C: 'fail' });
  });

  it('does not treat a longer tag name like <testcase-extra> as a testcase', () => {
    const xml = report(passingCase('a'), '<testcase-extra name="not-a-real-case"/>');
    expect(ingest(xml).results).toEqual({ a: 'pass' });
    expect('not-a-real-case' in ingest(xml).results).toBe(false);
  });

  it('never throws on malformed input — yields empty results', () => {
    for (const bad of [null, undefined, 42, {}, [], ['<testcase name="a"/>'], '<not-xml-at-all']) {
      expect(() => ingest(bad)).not.toThrow();
    }
    expect(ingest(null).results).toEqual({});
    expect(ingest(undefined).results).toEqual({});
    expect(ingest(42).results).toEqual({});
    expect(ingest({}).results).toEqual({});
    expect(ingest([]).results).toEqual({});
    // A non-string raw (even an array containing a plausible testcase string) is not scanned —
    // only a string `raw` is parsed, matching cucumber's "non-array raw -> empty" defensiveness.
    expect(ingest(['<testcase name="a"/>']).results).toEqual({});
    expect(ingest('<not-xml-at-all').results).toEqual({});
  });
});

describe('junitEmitter.ingest — TestRun envelope', () => {
  it('stamps the run identity from meta and emitter="junit"', () => {
    const run = junitEmitter.ingest(report(passingCase('a')), {
      id: 'run-1',
      ts: '2026-07-19T00:00:00Z',
      sha: 'deadbeef',
      ci: 'github-actions',
    });
    expect(run).toEqual({
      id: 'run-1',
      ts: '2026-07-19T00:00:00Z',
      sha: 'deadbeef',
      ci: 'github-actions',
      emitter: 'junit',
      results: { a: 'pass' },
    });
  });

  it('omits sha/ci when meta does not carry them (no undefined keys)', () => {
    const run = junitEmitter.ingest(report(passingCase('a')), {
      id: 'run-2',
      ts: '2026-07-19T00:00:00Z',
    });
    expect('sha' in run).toBe(false);
    expect('ci' in run).toBe(false);
  });
});
