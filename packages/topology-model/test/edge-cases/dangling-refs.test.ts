import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

const TOPOLOGY = (connections: string, environments = '[prod]'): string =>
  `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: ${environments}\n  defaultEnvironment: prod\n${connections}\n`;

const RESOURCE = (kind: string, extra = ''): string =>
  `apiVersion: workspec.io/v1alpha1\nkind: Resource\nmetadata: {}\nspec:\n  name: R\n  kind: ${kind}\n  type: T\n  provider: azure\n${extra}`;

const ENVIRONMENT_YAML =
  'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n';

describe('dangling-ref: connections', () => {
  it('flags a connection endpoint that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY(
          '  connections:\n    - from: ghost\n      to: also-ghost\n',
        ),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toHaveLength(2);
    expect(danglers.map((d) => d.refSlug).sort()).toEqual(['also-ghost', 'ghost']);
    expect(danglers[0]).toMatchObject({ severity: 'error', file: '.workspec/topologies/t.yaml' });
    expect(danglers[0]?.line).toBeGreaterThan(0);
  });
});

describe('dangling-ref: placement refs', () => {
  it('flags a resource network/resourceGroup ref that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE('compute', '  network: ghost-subnet\n'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toEqual([
      expect.objectContaining({
        severity: 'error',
        file: '.workspec/resources/app.yaml',
        refSlug: 'ghost-subnet',
      }),
    ]);
  });
});

describe('non-grouping-placement', () => {
  it('flags a network ref that resolves, but to a resource that is not a vnet/subnet', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE('compute', '  network: cache\n'),
        '.workspec/resources/cache.yaml': RESOURCE('cache'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.nonGroupingPlacement,
        file: '.workspec/resources/app.yaml',
        refSlug: 'cache',
      }),
    ]);
  });

  it('does not flag a network ref that resolves to a vnet, or a resourceGroup ref that resolves to a resource-group', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  network: vnet1\n  resourceGroup: rg1\n',
        ),
        '.workspec/resources/vnet1.yaml': RESOURCE('vnet'),
        '.workspec/resources/rg1.yaml': RESOURCE('resource-group'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(
      model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.nonGroupingPlacement),
    ).toEqual([]);
    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef)).toEqual([]);
  });
});

/**
 * S1 adversarial review's empirical A/B/C scenario, retested here: every
 * `spec.overrides` key falls into exactly one of three buckets, and each
 * must yield EXACTLY the diagnostics that bucket implies — never both rules
 * firing on the same key, never zero when one should fire, never the
 * (now-removed) schema-level cascade of unrelated spurious errors that
 * reviewer originally reproduced (7 diagnostics from what should have been
 * 1, because a schema-level failure used to drop the WHOLE resource out of
 * the loaded model).
 */
describe('override-environment-refs (S1): scenario A/B/C', () => {
  it('(A) unknown env id — not declared anywhere on the topology — yields exactly one dangling-override-environment-ref, and the resource still loads', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  overrides:\n    staging:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: DIAGNOSTIC_CODES.danglingOverrideEnvironmentRef,
        file: '.workspec/resources/app.yaml',
        refSlug: 'staging',
      }),
    ]);
    expect(model.diagnostics[0]?.line).toBeGreaterThan(0);
    // The resource itself still loaded — no cascade.
    expect(model.resources.has('app')).toBe(true);
  });

  it('(B) known env, but this resource is not present in it — yields exactly one override-environment-not-present, no schema/parse-error, and the resource still loads (no cascade)', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  environments: [prod]\n  overrides:\n    dev:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: DIAGNOSTIC_CODES.overrideEnvironmentNotPresent,
        file: '.workspec/resources/app.yaml',
        refSlug: 'dev',
      }),
    ]);
    expect(model.diagnostics[0]?.line).toBeGreaterThan(0);
    // Not a parse-error / cascade: the resource loaded, and no OTHER
    // diagnostic (e.g. a bogus dangling-ref about "app" not existing) fired.
    expect(model.resources.has('app')).toBe(true);
    expect(model.diagnostics).toHaveLength(1);
    // Message steers the author to remove the key, not add the env to
    // presence (the exact adversarial-review "misdirection" finding).
    expect(model.diagnostics[0]?.message).toContain('Remove this override key');
    expect(model.diagnostics[0]?.message).not.toMatch(/^add/i);
  });

  it('(C) known env AND this resource is present in it — the happy path — yields zero diagnostics', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  environments: [dev, prod]\n  overrides:\n    prod:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(
      model.diagnostics.filter(
        (d) =>
          d.code === DIAGNOSTIC_CODES.danglingOverrideEnvironmentRef ||
          d.code === DIAGNOSTIC_CODES.overrideEnvironmentNotPresent,
      ),
    ).toEqual([]);
  });

  it('(C variant) omitted `environments` (present in every topology env) never trips the presence rule', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  overrides:\n    dev:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(model.diagnostics).toEqual([]);
  });

  it("POSITION CONSISTENCY: (A) and (B) locate the SAME kind of key (the env id itself), not one line into the key's nested value, and land on the same line for structurally-identical fixtures", async () => {
    // Both fixtures are byte-for-byte identical in shape up to the override
    // key itself (an `environments:` line, then `overrides:`, then the one
    // key, each on its own line) — only the key's NAME and whether it's
    // topology-known differ. Counting from `RESOURCE`'s fixed 8-line
    // preamble: `environments:` is file-line 9, `overrides:` is line 10, the
    // key itself ("staging"/"dev") is line 11 — NOT line 12, which is where
    // the key's own nested value's first child (`cost:`) starts and where
    // the generic value-range locator (`createYamlLocator`) would
    // mislocate it instead.
    const aModel = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  environments: [dev, prod]\n  overrides:\n    staging:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );
    const bModel = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  environments: [prod]\n  overrides:\n    dev:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(aModel.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.danglingOverrideEnvironmentRef);
    expect(bModel.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.overrideEnvironmentNotPresent);
    expect(aModel.diagnostics[0]?.line).toBe(11);
    expect(bModel.diagnostics[0]?.line).toBe(11);
    // Neither lands on line 12 (`cost:`) — the value-range mislocation this
    // dedicated key-locator exists to avoid.
    expect(aModel.diagnostics[0]?.line).not.toBe(12);
  });

  it('REVERT-CHECK evidence: a key that is simultaneously unknown-to-topology is reported as (A) only, never also as (B)', async () => {
    // "staging" isn't declared on the topology at all, so whether or not
    // this resource's `environments` list happens to exclude it is moot —
    // rule (A) fires and short-circuits before rule (B) is even consulted.
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n', '[dev, prod]'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  environments: [prod]\n  overrides:\n    staging:\n      cost:\n        sku: x\n        mode: payg\n        schedule: always\n',
        ),
        '.workspec/environments/dev.yaml': ENVIRONMENT_YAML,
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(model.diagnostics).toHaveLength(1);
    expect(model.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.danglingOverrideEnvironmentRef);
  });
});

describe('dangling-ref: override placement values (S1, lead-accepted addition)', () => {
  it('flags an override resourceGroup value that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  resourceGroup: rg-app\n  overrides:\n    prod:\n      resourceGroup: rg-ghost\n',
        ),
        '.workspec/resources/rg-app.yaml': RESOURCE('resource-group'),
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toEqual([
      expect.objectContaining({
        severity: 'error',
        file: '.workspec/resources/app.yaml',
        refSlug: 'rg-ghost',
      }),
    ]);
  });

  it('flags an override network value that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  network: snet-app\n  overrides:\n    prod:\n      network: snet-ghost\n',
        ),
        '.workspec/resources/snet-app.yaml': RESOURCE('subnet'),
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toEqual([
      expect.objectContaining({
        severity: 'error',
        file: '.workspec/resources/app.yaml',
        refSlug: 'snet-ghost',
      }),
    ]);
  });

  it('happy path: an override resourceGroup value that DOES resolve to a real resource-group is still green', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE(
          'compute',
          '  resourceGroup: rg-shared\n  overrides:\n    prod:\n      resourceGroup: rg-isolated\n',
        ),
        '.workspec/resources/rg-shared.yaml': RESOURCE('resource-group'),
        '.workspec/resources/rg-isolated.yaml': RESOURCE('resource-group'),
        '.workspec/environments/prod.yaml': ENVIRONMENT_YAML,
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef)).toEqual([]);
    expect(
      model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.nonGroupingPlacement),
    ).toEqual([]);
  });
});

describe('dangling-environment-ref', () => {
  it('flags a declared environment slug with no matching environment file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
      }),
    );

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: DIAGNOSTIC_CODES.danglingEnvironmentRef,
        refSlug: 'prod',
      }),
    );
  });
});

describe('dangling-catalog-ref', () => {
  it('flags a catalog ref with no matching catalog file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  catalog: missing-catalog\n  connections: []\n`,
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.danglingCatalogRef,
        refSlug: 'missing-catalog',
      }),
    );
  });

  it('does not flag when the catalog file is present', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  catalog: present-catalog\n  connections: []\n`,
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
        '.workspec/catalogs/present-catalog.yaml': 'anything',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingCatalogRef)).toEqual(
      [],
    );
  });
});
