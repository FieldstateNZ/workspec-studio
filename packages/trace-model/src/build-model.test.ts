import { describe, expect, it } from 'vitest';
import type { Actor, Feature, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import { buildModel } from './index.js';
import type { Located, TestRun, TraceTree } from './index.js';

// ── Minimal hand-built input builders (envelope boilerplate hidden) ───────────

const API_VERSION = 'workspec.io/v1alpha1';

function actor(slug: string): Located<Actor> {
  return {
    slug,
    source: { file: `actors/${slug}.yml` },
    artifact: { apiVersion: API_VERSION, kind: 'Actor', metadata: {}, spec: { name: slug } },
  };
}

function feature(slug: string, file = `features/${slug}.yml`): Located<Feature> {
  return {
    slug,
    source: { file },
    artifact: { apiVersion: API_VERSION, kind: 'Feature', metadata: {}, spec: { name: slug } },
  };
}

function userReq(
  slug: string,
  opts: { actor?: string; features?: string[]; file?: string } = {},
): Located<UserRequirement> {
  return {
    slug,
    source: { file: opts.file ?? `requirements/user/${slug}.yml` },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: {},
      spec: {
        title: slug,
        actor: opts.actor ?? 'dev-lead',
        as: 'a dev lead',
        want: 'something',
        so: 'a reason',
        features: opts.features ?? ['f1'],
        status: 'agreed',
        links: [],
      },
    },
  };
}

function sysReq(
  slug: string,
  opts: { feature?: string; userReqs?: string[]; file?: string } = {},
): Located<SystemRequirement> {
  return {
    slug,
    source: { file: opts.file ?? `requirements/system/${slug}.yml` },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: {},
      spec: {
        title: slug,
        feature: opts.feature ?? 'f1',
        userReqs: opts.userReqs ?? ['u1'],
        then: ['it holds'],
      },
    },
  };
}

function tree(partial: Partial<TraceTree>): TraceTree {
  return {
    actors: partial.actors ?? [actor('dev-lead')],
    features: partial.features ?? [feature('f1')],
    userRequirements: partial.userRequirements ?? [],
    systemRequirements: partial.systemRequirements ?? [],
  };
}

function run(id: string, ts: string, results: TestRun['results']): TestRun {
  return { id, ts, emitter: 'cucumber', results };
}

describe('buildModel — empty and degenerate inputs', () => {
  it('an empty tree derives vacuous meters and no findings, never throwing', () => {
    const model = buildModel(
      { actors: [], features: [], userRequirements: [], systemRequirements: [] },
      [],
    );
    expect(model.latestRun).toBeNull();
    expect(model.coverage).toEqual({ numerator: 0, denominator: 0, ratio: 1 });
    expect(model.passRate).toEqual({ numerator: 0, denominator: 0, ratio: 1 });
    expect(model.findings).toEqual([]);
  });

  it('with no runs, every sysreq is unproven and pass-rate is vacuous', () => {
    const model = buildModel(
      tree({
        userRequirements: [userReq('u1')],
        systemRequirements: [sysReq('s1', { userReqs: ['u1'] })],
      }),
      [],
    );
    expect(model.systemRequirements[0]?.proof).toBe('unproven');
    expect(model.passRate).toEqual({ numerator: 0, denominator: 0, ratio: 1 });
    // A userReq with a verifier that has no passing evidence is not covered.
    expect(model.coverage).toEqual({ numerator: 0, denominator: 1, ratio: 0 });
  });
});

describe('buildModel — meters', () => {
  it('coverage counts userReqs with ≥1 passing verifier over ALL userReqs', () => {
    const model = buildModel(
      tree({
        userRequirements: [userReq('u1'), userReq('u2'), userReq('u3')],
        systemRequirements: [
          sysReq('s1', { userReqs: ['u1'] }),
          sysReq('s2', { userReqs: ['u2'] }),
          // u3 has no verifier at all → orphan, uncovered.
        ],
      }),
      [run('r1', '2026-01-01T00:00:00Z', { s1: 'pass', s2: 'fail' })],
    );
    // u1 covered (s1 pass), u2 not (s2 fail), u3 orphan → 1 of 3.
    expect(model.coverage).toEqual({ numerator: 1, denominator: 3, ratio: 1 / 3 });
  });

  it('pass-rate counts passing over sysreqs WITH evidence (skip counts as evidence, absence does not)', () => {
    const model = buildModel(
      tree({
        userRequirements: [userReq('u1')],
        systemRequirements: [
          sysReq('s-pass', { userReqs: ['u1'] }),
          sysReq('s-fail', { userReqs: ['u1'] }),
          sysReq('s-skip', { userReqs: ['u1'] }),
          sysReq('s-absent', { userReqs: ['u1'] }),
        ],
      }),
      [run('r1', '2026-01-01T00:00:00Z', { 's-pass': 'pass', 's-fail': 'fail', 's-skip': 'skip' })],
    );
    // Evidenced = pass + fail + skip = 3 (s-absent is unproven); passing = 1.
    expect(model.passRate).toEqual({ numerator: 1, denominator: 3, ratio: 1 / 3 });
  });
});

describe('buildModel — proof distinctness and latest-run-wins', () => {
  it('pass / fail / skip / unproven are four distinct states', () => {
    const model = buildModel(
      tree({
        userRequirements: [userReq('u1')],
        systemRequirements: [
          sysReq('a', { userReqs: ['u1'] }),
          sysReq('b', { userReqs: ['u1'] }),
          sysReq('c', { userReqs: ['u1'] }),
          sysReq('d', { userReqs: ['u1'] }),
        ],
      }),
      [run('r', '2026-01-01T00:00:00Z', { a: 'pass', b: 'fail', c: 'skip' })],
    );
    const proof = Object.fromEntries(model.systemRequirements.map((s) => [s.slug, s.proof]));
    expect(proof).toEqual({ a: 'pass', b: 'fail', c: 'skip', d: 'unproven' });
  });

  it('the latest run by timestamp wins, regardless of input order', () => {
    const newer = run('2026-02', '2026-02-01T00:00:00Z', { s1: 'fail' });
    const older = run('2026-01', '2026-01-01T00:00:00Z', { s1: 'pass' });
    const t = tree({
      userRequirements: [userReq('u1')],
      systemRequirements: [sysReq('s1', { userReqs: ['u1'] })],
    });
    for (const runs of [
      [older, newer],
      [newer, older],
    ]) {
      const model = buildModel(t, runs);
      expect(model.latestRun?.id).toBe('2026-02');
      expect(model.systemRequirements[0]?.proof).toBe('fail');
    }
  });

  it('ties on timestamp break deterministically on the greater id', () => {
    const a = run('run-a', '2026-01-01T00:00:00Z', { s1: 'pass' });
    const b = run('run-b', '2026-01-01T00:00:00Z', { s1: 'fail' });
    const t = tree({
      userRequirements: [userReq('u1')],
      systemRequirements: [sysReq('s1', { userReqs: ['u1'] })],
    });
    expect(buildModel(t, [a, b]).latestRun?.id).toBe('run-b');
    expect(buildModel(t, [b, a]).latestRun?.id).toBe('run-b');
  });
});

describe('buildModel — findings', () => {
  it('the orphan-userReq finding fires exactly when no sysreq verifies a userReq', () => {
    const withVerifier = buildModel(
      tree({
        userRequirements: [userReq('u1')],
        systemRequirements: [sysReq('s1', { userReqs: ['u1'] })],
      }),
      [],
    );
    expect(withVerifier.findings.some((f) => f.kind === 'orphan-user-requirement')).toBe(false);
    expect(withVerifier.userRequirements[0]?.orphan).toBe(false);

    const withoutVerifier = buildModel(tree({ userRequirements: [userReq('u1')] }), []);
    const orphans = withoutVerifier.findings.filter((f) => f.kind === 'orphan-user-requirement');
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.slug).toBe('u1');
    expect(withoutVerifier.userRequirements[0]?.orphan).toBe(true);
  });

  it('dangling intra-tree refs are flagged; cross-layer links are never checked', () => {
    const model = buildModel(
      tree({
        actors: [actor('dev-lead')],
        features: [feature('f1')],
        userRequirements: [
          // links present but NEVER dangling-checked (inert if unresolvable).
          {
            ...userReq('u1', { actor: 'missing-actor', features: ['missing-feature'] }),
          },
        ],
        systemRequirements: [
          sysReq('s1', { feature: 'missing-feature', userReqs: ['missing-ur'] }),
        ],
      }),
      [],
    );
    const dangling = model.findings.filter((f) => f.kind === 'dangling-ref');
    expect(dangling.map((f) => `${f.slug}:${f.field}:${f.ref}`).sort()).toEqual([
      's1:feature:missing-feature',
      's1:userReqs:missing-ur',
      'u1:actor:missing-actor',
      'u1:features:missing-feature',
    ]);
    // No finding ever references the `links` field.
    expect(model.findings.some((f) => f.field === 'links')).toBe(false);
  });

  it('a duplicate slug of the same kind flags each colliding file (error severity)', () => {
    const model = buildModel(
      tree({
        userRequirements: [userReq('u1')],
        systemRequirements: [
          sysReq('dup', { userReqs: ['u1'], file: 'a.yml' }),
          sysReq('dup', { userReqs: ['u1'], file: 'b.yml' }),
        ],
      }),
      [],
    );
    const dups = model.findings.filter((f) => f.kind === 'duplicate-slug');
    expect(dups).toHaveLength(2);
    expect(dups.every((f) => f.severity === 'error')).toBe(true);
    expect(dups.map((f) => f.file).sort()).toEqual(['a.yml', 'b.yml']);
  });
});

describe('buildModel — determinism and ordering', () => {
  const messy = tree({
    features: [feature('zeta'), feature('alpha')],
    userRequirements: [
      userReq('u-z', { features: ['zeta'] }),
      userReq('u-a', { features: ['alpha'] }),
    ],
    systemRequirements: [
      sysReq('s-z', { feature: 'zeta', userReqs: ['u-z'] }),
      sysReq('s-a', { feature: 'alpha', userReqs: ['u-a'] }),
    ],
  });

  it('every node array is sorted by slug', () => {
    const model = buildModel(messy, []);
    expect(model.features.map((f) => f.slug)).toEqual(['alpha', 'zeta']);
    expect(model.userRequirements.map((u) => u.slug)).toEqual(['u-a', 'u-z']);
    expect(model.systemRequirements.map((s) => s.slug)).toEqual(['s-a', 's-z']);
  });

  it('findings are in a stable total order and input order does not matter', () => {
    const forward = buildModel(messy, []);
    const shuffled = buildModel(
      {
        actors: [...messy.actors].reverse(),
        features: [...messy.features].reverse(),
        userRequirements: [...messy.userRequirements].reverse(),
        systemRequirements: [...messy.systemRequirements].reverse(),
      },
      [],
    );
    expect(shuffled).toEqual(forward);
  });
});
