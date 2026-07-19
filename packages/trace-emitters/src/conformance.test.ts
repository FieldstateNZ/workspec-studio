import { describe, expect, it } from 'vitest';
import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  UserRequirement,
} from '@workspec/req-schema';
import type { Located, TraceTree } from '@workspec/trace-model';
import { assertRoundTrip, roundTrip } from './conformance.js';
import { cucumberEmitter, mockCucumberRun } from './cucumber.js';
import { junitEmitter, mockJunitRun } from './junit.js';
import type { MockRunner } from './conformance.js';
import type { RunMeta } from './types.js';

const API_VERSION = 'workspec.io/v1alpha1';
const META: RunMeta = {
  id: '2026-07-19T00-00Z',
  ts: '2026-07-19T00:00:00Z',
  sha: 'abc123',
  ci: 'github-actions',
};

function actor(slug: string, name: string): Located<Actor> {
  return {
    slug,
    source: { file: `actors/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'Actor', metadata: { slug }, spec: { name } },
  };
}

function feature(slug: string, name: string): Located<Feature> {
  return {
    slug,
    source: { file: `features/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'Feature', metadata: { slug }, spec: { name } },
  };
}

function userReq(slug: string, spec: UserRequirement['spec']): Located<UserRequirement> {
  return {
    slug,
    source: { file: `requirements/user/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'UserRequirement', metadata: { slug }, spec },
  };
}

function sysReq(slug: string, spec: SystemRequirement['spec']): Located<SystemRequirement> {
  return {
    slug,
    source: { file: `requirements/system/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'SystemRequirement', metadata: { slug }, spec },
  };
}

function scenario(slug: string, spec: Scenario['spec']): Located<Scenario> {
  return {
    slug,
    source: { file: `scenarios/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'Scenario', metadata: { slug }, spec },
  };
}

/** A small, fully-wired tree (no dangling refs, no orphans) so the model proves cleanly. */
function buildTree(): TraceTree {
  return {
    actors: [actor('dev-lead', 'Dev lead')],
    features: [feature('element-authoring', 'Element authoring')],
    userRequirements: [
      userReq('authoring-flow', {
        title: 'Author an element without leaving the canvas',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to author a new element inline on the canvas',
        so: "that I don't break flow switching to a form",
        features: ['element-authoring'],
        status: 'agreed',
        links: [],
      }),
    ],
    systemRequirements: [
      sysReq('inline-create', {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
    ],
    scenarios: [
      scenario('inline-create-persists', {
        title: 'Creating an element inline saves it immediately',
        systemRequirement: 'inline-create',
        given: ['a canvas with no selected element'],
        when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
        then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
      }),
      scenario('inline-create-each-kind', {
        title: 'Inline create works for each element kind',
        systemRequirement: 'inline-create',
        given: ['a canvas'],
        when: ['the dev lead inline-creates a "<kind>"'],
        then: ['a valid "<kind>" artifact is written'],
        examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
      }),
    ],
  };
}

const ALL_SLUGS = ['inline-create-each-kind', 'inline-create-persists'];

describe('round-trip conformance (issue #71) — emit → run → ingest → proven', () => {
  it('proves every emitted scenario when the mock run passes (assertRoundTrip does not throw)', () => {
    const tree = buildTree();
    const result = assertRoundTrip(cucumberEmitter, tree, mockCucumberRun, META);

    expect(result.provenSlugs).toEqual(ALL_SLUGS);
    expect(result.unprovenSlugs).toEqual([]);
    expect(result.emitted.map((f) => f.path)).toEqual(['inline-create.feature']);
    expect(result.run.emitter).toBe('cucumber');
    expect(result.run.results).toEqual({
      'inline-create-each-kind': 'pass',
      'inline-create-persists': 'pass',
    });
  });

  it('makes "proven" SEMANTIC via trace-model: ScenarioNode.proof === pass, meters saturated', () => {
    const { model } = assertRoundTrip(cucumberEmitter, buildTree(), mockCucumberRun, META);

    expect(model.scenarios.map((n) => [n.slug, n.proof])).toEqual([
      ['inline-create-each-kind', 'pass'],
      ['inline-create-persists', 'pass'],
    ]);
    expect(model.passRate).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    expect(model.scenarioCoverage).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    // userReq coverage: authoring-flow has a rule-proven verifier → covered.
    expect(model.userReqCoverage).toEqual({ numerator: 1, denominator: 1, ratio: 1 });
    expect(model.userRequirements[0]?.covered).toBe(true);
    expect(model.systemRequirements[0]?.ruleProven).toBe(true);
    expect(model.findings).toEqual([]);
  });

  it('closes the loop: every emitted @tag becomes a key in the ingested run', () => {
    const { emitted, run } = roundTrip(cucumberEmitter, buildTree(), mockCucumberRun, META);
    for (const file of emitted) {
      const tags = [...file.content.matchAll(/^ {4}@(?<slug>\S+)$/gm)].map((m) => m.groups?.slug);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toBeDefined();
        expect(run.results[tag as string]).toBeDefined();
      }
    }
  });

  it('NEGATIVE — a failing scenario ingests to fail, leaving the slug unproven (fail reflected in the model)', () => {
    const failing: MockRunner = (rules) =>
      mockCucumberRun(rules, { failing: ['inline-create-persists'] });
    const { run, model, provenSlugs, unprovenSlugs } = roundTrip(
      cucumberEmitter,
      buildTree(),
      failing,
      META,
    );

    expect(run.results['inline-create-persists']).toBe('fail');
    const failed = model.scenarios.find((n) => n.slug === 'inline-create-persists');
    expect(failed?.proof).toBe('fail');
    expect(unprovenSlugs).toEqual(['inline-create-persists']);
    expect(provenSlugs).toEqual(['inline-create-each-kind']);
    expect(model.passRate).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });

    // The Rule that groups the failing scenario is no longer rule-proven, so
    // its userReq loses coverage too — proving the failure propagates.
    expect(model.systemRequirements[0]?.ruleProven).toBe(false);
    expect(model.userRequirements[0]?.covered).toBe(false);

    // The conformance claim must FAIL for a run that does not prove everything.
    expect(() => assertRoundTrip(cucumberEmitter, buildTree(), failing, META)).toThrow(
      /inline-create-persists/,
    );
  });

  it('NEGATIVE — a skipped scenario is unproven (skip is not pass)', () => {
    const skipping: MockRunner = (rules) =>
      mockCucumberRun(rules, { skipping: ['inline-create-each-kind'] });
    const { run, model, unprovenSlugs } = roundTrip(cucumberEmitter, buildTree(), skipping, META);

    expect(run.results['inline-create-each-kind']).toBe('skip');
    const skipped = model.scenarios.find((n) => n.slug === 'inline-create-each-kind');
    expect(skipped?.proof).toBe('skip');
    expect(unprovenSlugs).toEqual(['inline-create-each-kind']);
  });
});

// ── junit — the SAME emitter-agnostic harness, second provider (spec §3) ──────
//
// Proves the seam generalises: `roundTrip`/`assertRoundTrip` (conformance.ts)
// take ZERO junit-specific branches — only the `emitter`/`runner` arguments
// change from the cucumber block above.

describe('round-trip conformance — junit (the SAME harness, second provider)', () => {
  it('proves every emitted scenario when the mock run passes (assertRoundTrip does not throw)', () => {
    const tree = buildTree();
    const result = assertRoundTrip(junitEmitter, tree, mockJunitRun, META);

    expect(result.provenSlugs).toEqual(ALL_SLUGS);
    expect(result.unprovenSlugs).toEqual([]);
    expect(result.emitted.map((f) => f.path)).toEqual(['inline-create.xml']);
    expect(result.run.emitter).toBe('junit');
    expect(result.run.results).toEqual({
      'inline-create-each-kind': 'pass',
      'inline-create-persists': 'pass',
    });
  });

  it('makes "proven" SEMANTIC via trace-model: ScenarioNode.proof === pass, meters saturated', () => {
    const { model } = assertRoundTrip(junitEmitter, buildTree(), mockJunitRun, META);

    expect(model.scenarios.map((n) => [n.slug, n.proof])).toEqual([
      ['inline-create-each-kind', 'pass'],
      ['inline-create-persists', 'pass'],
    ]);
    expect(model.passRate).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    expect(model.scenarioCoverage).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    expect(model.userReqCoverage).toEqual({ numerator: 1, denominator: 1, ratio: 1 });
    expect(model.userRequirements[0]?.covered).toBe(true);
    expect(model.systemRequirements[0]?.ruleProven).toBe(true);
    expect(model.findings).toEqual([]);
  });

  it('closes the loop: every emitted testcase name="<slug>" becomes a key in the ingested run', () => {
    const { emitted, run } = roundTrip(junitEmitter, buildTree(), mockJunitRun, META);
    for (const file of emitted) {
      const names = [...file.content.matchAll(/<testcase\b[^>]*\bname="(?<slug>[^"]+)"/g)].map(
        (m) => m.groups?.slug,
      );
      expect(names.length).toBeGreaterThan(0);
      for (const slug of names) {
        expect(slug).toBeDefined();
        expect(run.results[slug as string]).toBeDefined();
      }
    }
  });

  it('NEGATIVE — a failing scenario ingests to fail, leaving the slug unproven (fail reflected in the model)', () => {
    const failing: MockRunner = (rules) =>
      mockJunitRun(rules, { failing: ['inline-create-persists'] });
    const { run, model, provenSlugs, unprovenSlugs } = roundTrip(
      junitEmitter,
      buildTree(),
      failing,
      META,
    );

    expect(run.results['inline-create-persists']).toBe('fail');
    const failed = model.scenarios.find((n) => n.slug === 'inline-create-persists');
    expect(failed?.proof).toBe('fail');
    expect(unprovenSlugs).toEqual(['inline-create-persists']);
    expect(provenSlugs).toEqual(['inline-create-each-kind']);
    expect(model.passRate).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });

    expect(model.systemRequirements[0]?.ruleProven).toBe(false);
    expect(model.userRequirements[0]?.covered).toBe(false);

    expect(() => assertRoundTrip(junitEmitter, buildTree(), failing, META)).toThrow(
      /inline-create-persists/,
    );
  });

  it('NEGATIVE — a skipped scenario is unproven (skip is not pass)', () => {
    const skipping: MockRunner = (rules) =>
      mockJunitRun(rules, { skipping: ['inline-create-each-kind'] });
    const { run, model, unprovenSlugs } = roundTrip(junitEmitter, buildTree(), skipping, META);

    expect(run.results['inline-create-each-kind']).toBe('skip');
    const skipped = model.scenarios.find((n) => n.slug === 'inline-create-each-kind');
    expect(skipped?.proof).toBe('skip');
    expect(unprovenSlugs).toEqual(['inline-create-each-kind']);
  });
});
