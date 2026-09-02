import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CatalogArtifact } from '@workspec/decision-schema';
import { EnvironmentArtifact, ResourceArtifact, TopologyArtifact } from '@workspec/topology-schema';
import { buildProviderArtifacts, compareProviders, deriveInfrastructurePlan, updateRequirement } from '../src/index.js';

describe('infrastructure planning', () => {
  const plan = deriveInfrastructurePlan('Ledger', [
    { id: 'web', kind: 'container', name: 'Web' },
    { id: 'db', kind: 'database', name: 'Database', technology: 'PostgreSQL' },
    { id: 'customer', kind: 'actor', name: 'Customer' },
  ]);

  it('derives only deployable C4 elements and retains realizes links', () => {
    expect(plan.spec.requirements.map((item) => item.kind)).toEqual(['compute', 'database']);
    expect(plan.spec.requirements[0]?.realizes).toEqual(['web']);
  });

  it('compares Azure and AWS against identical requirements', () => {
    const options = compareProviders(plan);
    expect(options.map((option) => option.provider)).toEqual(['azure', 'aws']);
    expect(options.every((option) => option.lines.length === 2)).toBe(true);
    expect(options.every((option) => option.monthlyTotal > 0)).toBe(true);
  });

  it('reprices edited requirements deterministically', () => {
    const larger = updateRequirement(plan, 'web', { size: 'large', quantity: 2 });
    const largerAzure = compareProviders(larger)[0];
    const originalAzure = compareProviders(plan)[0];
    if (largerAzure === undefined || originalAzure === undefined) throw new Error('Azure option missing');
    expect(largerAzure.monthlyTotal).toBeGreaterThan(originalAzure.monthlyTotal);
  });

  it('materializes schema-valid provider artifacts', () => {
    const azure = compareProviders(plan)[0];
    if (azure === undefined) throw new Error('Azure option missing');
    const files = buildProviderArtifacts(plan, azure);
    for (const [path, source] of Object.entries(files)) {
      const value = parse(source);
      if (path.includes('/environments/')) expect(EnvironmentArtifact.safeParse(value).success, path).toBe(true);
      if (path.includes('/resources/')) expect(ResourceArtifact.safeParse(value).success, path).toBe(true);
      if (path.includes('/topologies/')) expect(TopologyArtifact.safeParse(value).success, path).toBe(true);
      if (path.includes('/catalogs/')) expect(CatalogArtifact.safeParse(value).success, path).toBe(true);
    }
  });
});
