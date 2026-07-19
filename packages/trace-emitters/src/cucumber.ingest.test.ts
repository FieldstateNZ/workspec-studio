import { describe, expect, it } from 'vitest';
import { cucumberEmitter } from './cucumber.js';
import type { CucumberElement, CucumberReport, CucumberStatus, CucumberStep } from './cucumber.js';
import type { RunMeta } from './types.js';

const META: RunMeta = { id: '2026-07-09T02-14Z', ts: '2026-07-09T02:14:07Z' };

function steps(...statuses: (CucumberStatus | undefined)[]): CucumberStep[] {
  return statuses.map((status, i) => ({
    keyword: i === 0 ? 'Given ' : 'And ',
    name: `step ${i}`,
    result: status === undefined ? {} : { status },
  }));
}

function scenario(slug: string, stepList: CucumberStep[], keyword = 'Scenario'): CucumberElement {
  return { keyword, type: 'scenario', name: slug, tags: [{ name: `@${slug}` }], steps: stepList };
}

function report(...elements: CucumberElement[]): CucumberReport {
  return [{ uri: 'x.feature', keyword: 'Feature', name: 'x', elements }];
}

function ingest(raw: unknown) {
  return cucumberEmitter.ingest(raw, META);
}

describe('cucumberEmitter.ingest — verdict aggregation', () => {
  it('all steps passed → pass', () => {
    expect(ingest(report(scenario('a', steps('passed', 'passed')))).results).toEqual({ a: 'pass' });
  });

  it('any failed / ambiguous / undefined step → fail', () => {
    expect(ingest(report(scenario('a', steps('passed', 'failed')))).results.a).toBe('fail');
    expect(ingest(report(scenario('b', steps('passed', 'ambiguous')))).results.b).toBe('fail');
    expect(ingest(report(scenario('c', steps('passed', 'undefined')))).results.c).toBe('fail');
  });

  it('only skipped/pending steps → skip', () => {
    expect(ingest(report(scenario('a', steps('skipped', 'pending')))).results.a).toBe('skip');
  });

  it('a mix of passed and skipped → skip (pass requires ALL steps passed)', () => {
    expect(ingest(report(scenario('a', steps('passed', 'skipped')))).results.a).toBe('skip');
  });

  it('an empty scenario (no steps) → skip — zero passing steps is no proof', () => {
    expect(ingest(report(scenario('a', []))).results.a).toBe('skip');
  });

  it('an unknown / missing status is treated leniently as a skip, not a fail', () => {
    expect(ingest(report(scenario('a', steps('weird' as CucumberStatus)))).results.a).toBe('skip');
    expect(ingest(report(scenario('b', steps(undefined)))).results.b).toBe('skip');
  });
});

describe('cucumberEmitter.ingest — outline rows fold to one verdict per slug', () => {
  it('fail dominates: any failing row makes the slug fail', () => {
    const r = ingest(
      report(
        scenario('out', steps('passed'), 'Scenario Outline'),
        scenario('out', steps('failed'), 'Scenario Outline'),
      ),
    );
    expect(r.results.out).toBe('fail');
  });

  it('skip dominates pass: a passing + a skipping row → skip', () => {
    const r = ingest(
      report(
        scenario('out', steps('passed'), 'Scenario Outline'),
        scenario('out', steps('skipped'), 'Scenario Outline'),
      ),
    );
    expect(r.results.out).toBe('skip');
  });

  it('all rows passing → pass', () => {
    const r = ingest(
      report(
        scenario('out', steps('passed'), 'Scenario Outline'),
        scenario('out', steps('passed'), 'Scenario Outline'),
      ),
    );
    expect(r.results.out).toBe('pass');
  });
});

describe('cucumberEmitter.ingest — tag recovery + defensiveness', () => {
  it('keys on the slug recovered from the @<slug> tag, sorted', () => {
    const r = ingest(report(scenario('zeta', steps('passed')), scenario('alpha', steps('failed'))));
    expect(Object.keys(r.results)).toEqual(['alpha', 'zeta']);
  });

  it('recovers the slug from the FIRST tag when a scenario carries several', () => {
    const el: CucumberElement = {
      keyword: 'Scenario',
      tags: [{ name: '@my-sysreq' }, { name: '@smoke' }],
      steps: steps('passed'),
    };
    expect(Object.keys(ingest(report(el)).results)).toEqual(['my-sysreq']);
  });

  it('ignores scenarios with no recoverable tag (e.g. a Background)', () => {
    const background: CucumberElement = { keyword: 'Background', steps: steps('passed') };
    const untagged: CucumberElement = { keyword: 'Scenario', tags: [], steps: steps('passed') };
    expect(ingest(report(background, untagged)).results).toEqual({});
  });

  it('never throws on malformed input — yields empty results', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'nope',
      {},
      [null],
      [{ elements: 'nope' }],
      [{ elements: [null] }],
    ]) {
      expect(() => ingest(bad)).not.toThrow();
      expect(ingest(bad).results).toEqual({});
    }
  });
});

describe('cucumberEmitter.ingest — TestRun envelope', () => {
  it('stamps the run identity from meta and emitter="cucumber"', () => {
    const run = cucumberEmitter.ingest(report(scenario('a', steps('passed'))), {
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
      emitter: 'cucumber',
      results: { a: 'pass' },
    });
  });

  it('omits sha/ci when meta does not carry them (no undefined keys)', () => {
    const run = cucumberEmitter.ingest(report(scenario('a', steps('passed'))), {
      id: 'run-2',
      ts: '2026-07-19T00:00:00Z',
    });
    expect('sha' in run).toBe(false);
    expect('ci' in run).toBe(false);
  });
});
