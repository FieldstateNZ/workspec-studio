import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { EnvironmentArtifact, ResourceArtifact, TopologyArtifact } from '@workspec/topology-schema';
import { buildSolutionArtifacts, computeAnalysis, deriveInfrastructurePlan, duplicateSolutionOption, reconcileCostAnalysis, seedCostAnalysis, serializeCostCatalog, setOptionRequirementSku, updateRequirement, updateSolutionLine } from '../src/index.js';

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

  it('compares catalog-backed Azure and AWS solution options', () => {
    const options = computeAnalysis(seedCostAnalysis(plan));
    expect(options.map((option) => option.providerNames)).toEqual([['Microsoft Azure'], ['Amazon Web Services']]);
    expect(options.every((option) => option.lines.length === 4)).toBe(true);
    expect(options.every((option) => option.monthlyTotal > 0)).toBe(true);
  });

  it('supports multiple solution options from the same provider', () => {
    const analysis = duplicateSolutionOption(seedCostAnalysis(plan), 'azure-container-apps');
    expect(computeAnalysis(analysis).filter((option) => option.providerNames.includes('Microsoft Azure'))).toHaveLength(2);
  });

  it('preserves edited catalog mappings when requirements change', () => {
    const edited = setOptionRequirementSku(seedCostAnalysis(plan), 'azure-container-apps', 'web', 'azure-compute-large');
    const resized = updateRequirement(plan, 'db', { quantity: 2 });
    const reconciled = reconcileCostAnalysis(resized, edited);
    expect(reconciled.options[0]?.lines.filter((line) => line.requirementId === 'web').every((line) => line.skuId === 'azure-compute-large')).toBe(true);
  });

  it('reprices edited requirements deterministically', () => {
    const larger = updateRequirement(plan, 'web', { size: 'large', quantity: 2 });
    const largerAzure = computeAnalysis(seedCostAnalysis(larger))[0];
    const originalAzure = computeAnalysis(seedCostAnalysis(plan))[0];
    if (largerAzure === undefined || originalAzure === undefined) throw new Error('Azure option missing');
    expect(largerAzure.monthlyTotal).toBeGreaterThan(originalAzure.monthlyTotal);
  });

  it('edits environment-specific option assumptions', () => {
    const analysis = seedCostAnalysis(plan);
    const line = analysis.options[0]?.lines.find((item) => item.requirementId === 'web' && item.quantities?.dev !== undefined);
    if (line === undefined) throw new Error('Development cost line missing');
    const edited = updateSolutionLine(analysis, 'azure-container-apps', line.id, { scheduleId: 'always', quantities: { dev: 3 } });
    const updated = edited.options[0]?.lines.find((item) => item.id === line.id);
    expect(updated?.scheduleId).toBe('always');
    expect(updated?.quantities).toEqual({ dev: 3 });
    expect(computeAnalysis(edited)[0]?.monthlyTotal).toBeGreaterThan(computeAnalysis(analysis)[0]?.monthlyTotal ?? 0);
  });

  it('round-trips the complete catalog through YAML', () => {
    const catalog = seedCostAnalysis(plan).catalog;
    expect(parse(serializeCostCatalog(catalog))).toEqual(catalog);
  });

  it('materializes schema-valid solution artifacts', () => {
    const analysis = seedCostAnalysis(plan);
    const files = buildSolutionArtifacts(plan, analysis, 'azure-container-apps');
    for (const [path, source] of Object.entries(files)) {
      const value = parse(source);
      if (path.includes('/environments/')) expect(EnvironmentArtifact.safeParse(value).success, path).toBe(true);
      if (path.includes('/resources/')) expect(ResourceArtifact.safeParse(value).success, path).toBe(true);
      if (path.includes('/topologies/')) expect(TopologyArtifact.safeParse(value).success, path).toBe(true);
    }
  });
});
