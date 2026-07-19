import { describe, expect, it } from 'vitest';
import type { Actor, Feature, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import type { Located, TraceTree } from '@workspec/trace-model';
import { assertRoundTrip, roundTrip } from './conformance.js';
import { cucumberEmitter, mockCucumberRun } from './cucumber.js';
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
      sysReq('inline-create-persists', {
        title: 'Creating an element inline saves it immediately',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        given: ['a canvas with no selected element'],
        when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
        then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
      }),
      sysReq('inline-create-each-kind', {
        title: 'Inline create works for each element kind',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
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
  it('proves every emitted sysreq when the mock run passes (assertRoundTrip does not throw)', () => {
    const tree = buildTree();
    const result = assertRoundTrip(cucumberEmitter, tree, mockCucumberRun, META);

    expect(result.provenSlugs).toEqual(ALL_SLUGS);
    expect(result.unprovenSlugs).toEqual([]);
    expect(result.emitted.map((f) => f.path)).toEqual([
      'inline-create-each-kind.feature',
      'inline-create-persists.feature',
    ]);
    expect(result.run.emitter).toBe('cucumber');
    expect(result.run.results).toEqual({
      'inline-create-each-kind': 'pass',
      'inline-create-persists': 'pass',
    });
  });

  it('makes "proven" SEMANTIC via trace-model: proof === pass, meters saturated', () => {
    const { model } = assertRoundTrip(cucumberEmitter, buildTree(), mockCucumberRun, META);

    expect(model.systemRequirements.map((n) => [n.slug, n.proof])).toEqual([
      ['inline-create-each-kind', 'pass'],
      ['inline-create-persists', 'pass'],
    ]);
    expect(model.passRate).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    // coverage: authoring-flow has a passing verifier → covered.
    expect(model.coverage).toEqual({ numerator: 1, denominator: 1, ratio: 1 });
    expect(model.userRequirements[0]?.covered).toBe(true);
    expect(model.findings).toEqual([]);
  });

  it('closes the loop: every emitted @tag becomes a key in the ingested run', () => {
    const { emitted, run } = roundTrip(cucumberEmitter, buildTree(), mockCucumberRun, META);
    for (const file of emitted) {
      const tag = /^ {2}@(?<slug>\S+)$/m.exec(file.content)?.groups?.slug;
      expect(tag).toBeDefined();
      expect(run.results[tag as string]).toBeDefined();
    }
  });

  it('NEGATIVE — a failing scenario ingests to fail, leaving the slug unproven (fail reflected in the model)', () => {
    const failing: MockRunner = (sysreqs) =>
      mockCucumberRun(sysreqs, { failing: ['inline-create-persists'] });
    const { run, model, provenSlugs, unprovenSlugs } = roundTrip(
      cucumberEmitter,
      buildTree(),
      failing,
      META,
    );

    expect(run.results['inline-create-persists']).toBe('fail');
    const failed = model.systemRequirements.find((n) => n.slug === 'inline-create-persists');
    expect(failed?.proof).toBe('fail');
    expect(unprovenSlugs).toEqual(['inline-create-persists']);
    expect(provenSlugs).toEqual(['inline-create-each-kind']);
    expect(model.passRate).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });

    // The conformance claim must FAIL for a run that does not prove everything.
    expect(() => assertRoundTrip(cucumberEmitter, buildTree(), failing, META)).toThrow(
      /inline-create-persists/,
    );
  });

  it('NEGATIVE — a skipped scenario is unproven (skip is not pass)', () => {
    const skipping: MockRunner = (sysreqs) =>
      mockCucumberRun(sysreqs, { skipping: ['inline-create-each-kind'] });
    const { run, model, unprovenSlugs } = roundTrip(cucumberEmitter, buildTree(), skipping, META);

    expect(run.results['inline-create-each-kind']).toBe('skip');
    const skipped = model.systemRequirements.find((n) => n.slug === 'inline-create-each-kind');
    expect(skipped?.proof).toBe('skip');
    expect(unprovenSlugs).toEqual(['inline-create-each-kind']);
  });
});
