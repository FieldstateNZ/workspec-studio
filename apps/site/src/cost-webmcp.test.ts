import { buildPromotedRule, nextRuleId } from '@workspec/cost-ui';
import { describe, expect, it, vi } from 'vitest';

import {
  COST_DEMO_ATTRIBUTION_REF,
  COST_DEMO_INVENTORY_REF,
  createCostDemoRepository,
} from './cost-seed.js';
import {
  COST_WEBMCP_TOOL_NAMES,
  CostWebMcpService,
  createCostWebMcpTools,
  registerCostWebMcpTools,
  type WebMcpModelContext,
  type WebMcpToolDefinition,
} from './cost-webmcp.js';

function createService() {
  const repository = createCostDemoRepository();
  const onAttributionWritten = vi.fn();
  const onActivity = vi.fn();
  let nextProposal = 0;
  const service = new CostWebMcpService({
    repository,
    inventoryRef: COST_DEMO_INVENTORY_REF,
    attributionRef: COST_DEMO_ATTRIBUTION_REF,
    onAttributionWritten,
    onActivity,
    proposalIdFactory: () => `proposal-${++nextProposal}`,
  });
  return { repository, service, onAttributionWritten, onActivity };
}

describe('CostWebMcpService', () => {
  it('reports the exact 80-resource baseline and spend gap', async () => {
    const { service } = createService();

    await expect(service.getOverview()).resolves.toMatchObject({
      resourceCount: 80,
      totalMonthlySpend: 13_165,
      ruleCount: 8,
      primaryDimension: {
        id: 'product',
        allowedValues: ['workspec', 'atrium', 'coffers', 'shared'],
      },
      coverage: {
        percent: 81.2,
        unattributedResourceCount: 20,
        unattributedSpend: 2_474,
      },
    });
  });

  it('lists the three unattributed clusters in spend-descending order', async () => {
    const { service } = createService();

    await expect(service.listUnattributedClusters()).resolves.toMatchObject({
      clusterCount: 3,
      clusters: [
        { resourceGroup: 'rg-legacy-misc', resourceCount: 12, monthlySpend: 1_159 },
        { resourceGroup: 'rg-client-acme', resourceCount: 5, monthlySpend: 795 },
        { resourceGroup: 'rg-client-kauri', resourceCount: 3, monthlySpend: 520 },
      ],
    });
  });

  it('inspects only unresolved members of the requested cluster', async () => {
    const { service } = createService();

    const result = await service.inspectUnattributedCluster({ resourceGroup: 'rg-legacy-misc' });
    expect(result).toMatchObject({
      resourceGroup: 'rg-legacy-misc',
      resourceCount: 12,
      monthlySpend: 1_159,
    });
    expect(result.resources).toHaveLength(12);
    await expect(
      service.inspectUnattributedCluster({ resourceGroup: 'rg-shared-core' }),
    ).rejects.toMatchObject({ code: 'cluster_not_found' });
  });

  it('previews legacy attribution without mutating the repository', async () => {
    const { repository, service } = createService();
    const before = await repository.readAttribution(COST_DEMO_ATTRIBUTION_REF);

    const preview = await service.previewAttributionRule({
      resourceGroup: 'rg-legacy-misc',
      value: 'shared',
    });

    expect(preview).toMatchObject({
      proposalId: 'proposal-1',
      persisted: false,
      rule: { id: 'r9', match: { resourceGroup: 'rg-legacy-misc' }, assign: { product: 'shared' } },
      impact: {
        before: { percent: 81.2 },
        after: { percent: 90 },
        newlyAttributedResourceCount: 12,
        newlyAttributedMonthlySpend: 1_159,
      },
    });
    await expect(repository.readAttribution(COST_DEMO_ATTRIBUTION_REF)).resolves.toEqual(before);
  });

  it('applies a known fresh proposal once and notifies the UI cache', async () => {
    const { repository, service, onAttributionWritten } = createService();
    const preview = await service.previewAttributionRule({
      resourceGroup: 'rg-legacy-misc',
      value: 'shared',
    });

    const applied = await service.applyAttributionRule({ proposalId: preview.proposalId });

    expect(applied).toMatchObject({
      persisted: true,
      rule: { id: 'r9' },
      impact: { after: { percent: 90 }, newlyAttributedResourceCount: 12 },
    });
    expect((await repository.readAttribution(COST_DEMO_ATTRIBUTION_REF)).spec.rules).toHaveLength(
      9,
    );
    expect(onAttributionWritten).toHaveBeenCalledOnce();
    await expect(
      service.applyAttributionRule({ proposalId: preview.proposalId }),
    ).rejects.toMatchObject({ code: 'proposal_not_found' });
  });

  it('rejects invalid values and stale proposals without applying them', async () => {
    const { repository, service, onAttributionWritten } = createService();
    await expect(
      service.previewAttributionRule({ resourceGroup: 'rg-legacy-misc', value: 'secret-product' }),
    ).rejects.toMatchObject({ code: 'invalid_value' });

    const preview = await service.previewAttributionRule({
      resourceGroup: 'rg-legacy-misc',
      value: 'shared',
    });
    const attribution = await repository.readAttribution(COST_DEMO_ATTRIBUTION_REF);
    const interveningRule = buildPromotedRule(
      nextRuleId(attribution.spec.rules),
      'rg-client-acme',
      'product',
      'shared',
    );
    await repository.writeAttribution(COST_DEMO_ATTRIBUTION_REF, {
      ...attribution,
      spec: { ...attribution.spec, rules: [...attribution.spec.rules, interveningRule] },
    });

    await expect(
      service.applyAttributionRule({ proposalId: preview.proposalId }),
    ).rejects.toMatchObject({ code: 'stale_proposal' });
    expect(onAttributionWritten).not.toHaveBeenCalled();
  });

  it('reaches 100% through three sequential preview/apply pairs', async () => {
    const { service } = createService();
    for (const resourceGroup of ['rg-legacy-misc', 'rg-client-acme', 'rg-client-kauri']) {
      const preview = await service.previewAttributionRule({ resourceGroup, value: 'shared' });
      await service.applyAttributionRule({ proposalId: preview.proposalId });
    }

    await expect(service.getOverview()).resolves.toMatchObject({
      ruleCount: 11,
      coverage: { percent: 100, unattributedResourceCount: 0, unattributedSpend: 0 },
    });
    await expect(service.listUnattributedClusters()).resolves.toMatchObject({
      clusterCount: 0,
      clusters: [],
    });
  });
});

describe('Cost WebMCP tool surface', () => {
  it('defines five closed, annotated tools and returns serializable errors', async () => {
    const { service } = createService();
    const tools = createCostWebMcpTools(service);

    expect(tools.map((tool) => tool.name)).toEqual(COST_WEBMCP_TOOL_NAMES);
    expect(tools.slice(0, 4).every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools[4]?.annotations?.readOnlyHint).toBe(false);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }

    const previewTool = tools.find((tool) => tool.name === 'preview_attribution_rule');
    expect(previewTool).toBeDefined();
    await expect(
      previewTool?.execute({ resourceGroup: 'rg-legacy-misc', value: 'invented' }),
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_value' }),
    });
  });

  it('registers one Strict-Mode-safe batch and unregisters it on abort', async () => {
    const { service } = createService();
    const registered = new Map<string, WebMcpToolDefinition>();
    const context: WebMcpModelContext = {
      async registerTool(tool, options) {
        if (registered.has(tool.name)) throw new Error(`duplicate ${tool.name}`);
        registered.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => registered.delete(tool.name), {
          once: true,
        });
      },
    };
    const first = new AbortController();
    const second = new AbortController();

    const firstRegistration = registerCostWebMcpTools(context, service, first.signal);
    first.abort();
    const secondRegistration = registerCostWebMcpTools(context, service, second.signal);
    await Promise.all([firstRegistration, secondRegistration]);

    expect([...registered.keys()]).toEqual(COST_WEBMCP_TOOL_NAMES);
    second.abort();
    expect(registered.size).toBe(0);
  });
});
