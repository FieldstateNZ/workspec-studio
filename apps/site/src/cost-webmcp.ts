import { attribute } from '@workspec/cost-engine';
import type { Attribution, CostRepositoryPort, Inventory, Ref, Spend } from '@workspec/cost-schema';
import { buildPromotedRule, computeUnattributedClusters, nextRuleId } from '@workspec/cost-ui';

export const COST_WEBMCP_TOOL_NAMES = [
  'get_cost_overview',
  'list_unattributed_clusters',
  'inspect_unattributed_cluster',
  'preview_attribution_rule',
  'apply_attribution_rule',
] as const;

export type CostWebMcpActivityKind =
  'checking' | 'unsupported' | 'ready' | 'inspected' | 'previewed' | 'applied' | 'error';

export interface CostWebMcpActivity {
  kind: CostWebMcpActivityKind;
  title: string;
  detail: string;
}

export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface WebMcpToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<Record<string, unknown>>;
}

export interface WebMcpModelContext {
  registerTool(tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
}

interface CostSnapshot {
  inventory: Inventory;
  spends: Spend[];
  attribution: Attribution;
  result: ReturnType<typeof attribute>;
  primaryDimension: Attribution['spec']['dimensions'][number];
  primaryCoverage: ReturnType<typeof attribute>['coverage'][number];
  resourceGroupById: Map<string, string>;
}

interface Proposal {
  proposalId: string;
  fingerprint: string;
  resourceGroup: string;
  value: string;
  rule: Attribution['spec']['rules'][number];
}

export interface CostWebMcpServiceOptions {
  repository: CostRepositoryPort;
  inventoryRef: Ref;
  attributionRef: Ref;
  onAttributionWritten?: (attribution: Attribution) => void;
  onActivity?: (activity: CostWebMcpActivity) => void;
  proposalIdFactory?: () => string;
}

export class CostWebMcpError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CostWebMcpError';
  }
}

let fallbackProposalId = 0;

function defaultProposalId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  fallbackProposalId += 1;
  return `cost-proposal-${fallbackProposalId}`;
}

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function coverageSummary(coverage: CostSnapshot['primaryCoverage']): Record<string, number> {
  return {
    ratio: coverage.ratio,
    percent: round(coverage.ratio * 100),
    attributedSpend: coverage.attributedSpend,
    unattributedSpend: coverage.unattributedSpend,
    unattributedResourceCount: coverage.unattributedCount,
    totalSpend: coverage.totalSpend,
  };
}

function assignmentValue(assignment: unknown): unknown {
  if (typeof assignment !== 'object' || assignment === null) return assignment;
  if ('kind' in assignment && assignment.kind === 'value' && 'value' in assignment) {
    return assignment.value;
  }
  if ('kind' in assignment && assignment.kind === 'split' && 'parts' in assignment) {
    return assignment.parts;
  }
  return assignment;
}

function requireString(input: Record<string, unknown>, key: string, maximumLength: number): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CostWebMcpError('invalid_input', `"${key}" must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximumLength) {
    throw new CostWebMcpError(
      'invalid_input',
      `"${key}" must be at most ${maximumLength} characters.`,
    );
  }
  return trimmed;
}

function fingerprint(attribution: Attribution): string {
  return JSON.stringify(attribution.spec.rules);
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof CostWebMcpError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'tool_failed', message: error.message };
  }
  return { code: 'tool_failed', message: 'The cost tool could not complete the request.' };
}

export class CostWebMcpService {
  private readonly proposals = new Map<string, Proposal>();
  private readonly createProposalId: () => string;

  constructor(private readonly options: CostWebMcpServiceOptions) {
    this.createProposalId = options.proposalIdFactory ?? defaultProposalId;
  }

  private activity(activity: CostWebMcpActivity): void {
    this.options.onActivity?.(activity);
  }

  reportError(message: string): void {
    this.activity({
      kind: 'error',
      title: 'Agent tool could not complete',
      detail: message,
    });
  }

  private async snapshot(): Promise<CostSnapshot> {
    const [inventory, attribution, spendRefs] = await Promise.all([
      this.options.repository.readInventory(this.options.inventoryRef),
      this.options.repository.readAttribution(this.options.attributionRef),
      this.options.repository.listSpends(),
    ]);
    const spends = await Promise.all(
      spendRefs.map((spendRef) => this.options.repository.readSpend(spendRef.ref)),
    );
    const result = attribute(inventory, spends, attribution);
    const primaryDimension = attribution.spec.dimensions[0];
    const primaryCoverage = result.coverage.find((coverage) => coverage.isPrimary);
    if (primaryDimension === undefined || primaryCoverage === undefined) {
      throw new CostWebMcpError(
        'invalid_estate',
        'The current attribution has no primary dimension or coverage result.',
      );
    }
    return {
      inventory,
      spends,
      attribution,
      result,
      primaryDimension,
      primaryCoverage,
      resourceGroupById: new Map(
        inventory.spec.resources.map((resource) => [resource.id, resource.resourceGroup]),
      ),
    };
  }

  private clusters(snapshot: CostSnapshot, result = snapshot.result) {
    return computeUnattributedClusters(
      result.resolutions,
      snapshot.resourceGroupById,
      result.resourceSpend,
      snapshot.primaryDimension.id,
    ).sort(
      (left, right) =>
        right.amount - left.amount || left.resourceGroup.localeCompare(right.resourceGroup),
    );
  }

  private clusterOutput(snapshot: CostSnapshot, result = snapshot.result) {
    return this.clusters(snapshot, result).map((cluster) => ({
      resourceGroup: cluster.resourceGroup,
      resourceCount: cluster.count,
      monthlySpend: cluster.amount,
      suggestedNextAction: `Inspect ${cluster.resourceGroup}, then preview an attribution rule.`,
    }));
  }

  private project(snapshot: CostSnapshot, rule: Proposal['rule']) {
    const nextAttribution: Attribution = {
      ...snapshot.attribution,
      spec: {
        ...snapshot.attribution.spec,
        rules: [...snapshot.attribution.spec.rules, rule],
      },
    };
    const projectedResult = attribute(snapshot.inventory, snapshot.spends, nextAttribution);
    const projectedCoverage = projectedResult.coverage.find((coverage) => coverage.isPrimary);
    if (projectedCoverage === undefined) {
      throw new CostWebMcpError(
        'invalid_estate',
        'The projected attribution has no primary coverage.',
      );
    }
    return { nextAttribution, projectedResult, projectedCoverage };
  }

  async getOverview(): Promise<Record<string, unknown>> {
    const snapshot = await this.snapshot();
    const periods = [
      ...new Set(snapshot.spends.flatMap((spend) => spend.spec.rows.map((row) => row.period))),
    ].sort();
    const output = {
      estate: snapshot.attribution.metadata.name ?? snapshot.attribution.metadata.id,
      inventoryRef: this.options.inventoryRef,
      attributionRef: this.options.attributionRef,
      asOf: snapshot.inventory.spec.asOf,
      periods,
      currencies: snapshot.result.totals.currencies,
      resourceCount: snapshot.inventory.spec.resources.length,
      totalMonthlySpend: snapshot.result.totals.totalSpend,
      primaryDimension: {
        id: snapshot.primaryDimension.id,
        label: snapshot.primaryDimension.label,
        allowedValues: snapshot.primaryDimension.values,
      },
      ruleCount: snapshot.attribution.spec.rules.length,
      coverage: coverageSummary(snapshot.primaryCoverage),
      diagnosticCount: snapshot.result.diagnostics.length,
    };
    this.activity({
      kind: 'inspected',
      title: 'Agent inspected the cost overview',
      detail: `${output.resourceCount} resources · ${output.coverage.percent}% product coverage · $${snapshot.primaryCoverage.unattributedSpend.toLocaleString('en-US')}/mo unattributed.`,
    });
    return output;
  }

  async listUnattributedClusters(): Promise<Record<string, unknown>> {
    const snapshot = await this.snapshot();
    const clusters = this.clusterOutput(snapshot);
    this.activity({
      kind: 'inspected',
      title: 'Agent listed attribution gaps',
      detail: `${clusters.length} resource-group clusters remain on ${snapshot.primaryDimension.label}.`,
    });
    return {
      primaryDimension: snapshot.primaryDimension.id,
      allowedValues: snapshot.primaryDimension.values,
      clusterCount: clusters.length,
      clusters,
    };
  }

  async inspectUnattributedCluster(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const resourceGroup = requireString(input, 'resourceGroup', 128);
    const snapshot = await this.snapshot();
    const cluster = this.clusters(snapshot).find(
      (candidate) => candidate.resourceGroup === resourceGroup,
    );
    if (cluster === undefined) {
      throw new CostWebMcpError(
        'cluster_not_found',
        `"${resourceGroup}" is not a currently unattributed resource-group cluster.`,
      );
    }
    const resolutionById = new Map(
      snapshot.result.resolutions.map((resolution) => [resolution.resourceId, resolution]),
    );
    const resources = snapshot.inventory.spec.resources
      .filter((resource) => resource.resourceGroup === resourceGroup)
      .flatMap((resource) => {
        const resolution = resolutionById.get(resource.id);
        if (
          resolution === undefined ||
          resolution.assignments[snapshot.primaryDimension.id] !== undefined
        ) {
          return [];
        }
        return [
          {
            name: resource.name,
            type: resource.type,
            location: resource.location,
            monthlySpend: snapshot.result.resourceSpend[resource.id] ?? 0,
            tags: resource.tags ?? {},
            otherAssignments: Object.fromEntries(
              Object.entries(resolution.assignments)
                .filter(([dimensionId]) => dimensionId !== snapshot.primaryDimension.id)
                .map(([dimensionId, assignment]) => [dimensionId, assignmentValue(assignment)]),
            ),
          },
        ];
      });
    this.activity({
      kind: 'inspected',
      title: `Agent inspected ${resourceGroup}`,
      detail: `${cluster.count} resources · $${cluster.amount.toLocaleString('en-US')}/mo awaiting ${snapshot.primaryDimension.label} attribution.`,
    });
    return {
      resourceGroup,
      resourceCount: cluster.count,
      monthlySpend: cluster.amount,
      primaryDimension: snapshot.primaryDimension.id,
      allowedValues: snapshot.primaryDimension.values,
      resources,
    };
  }

  async previewAttributionRule(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resourceGroup = requireString(input, 'resourceGroup', 128);
    const value = requireString(input, 'value', 128);
    const snapshot = await this.snapshot();
    if (!snapshot.primaryDimension.values.includes(value)) {
      throw new CostWebMcpError(
        'invalid_value',
        `"${value}" is not allowed for ${snapshot.primaryDimension.id}. Allowed values: ${snapshot.primaryDimension.values.join(', ')}.`,
      );
    }
    const cluster = this.clusters(snapshot).find(
      (candidate) => candidate.resourceGroup === resourceGroup,
    );
    if (cluster === undefined) {
      throw new CostWebMcpError(
        'cluster_not_found',
        `"${resourceGroup}" is not a currently unattributed resource-group cluster.`,
      );
    }
    const rule = buildPromotedRule(
      nextRuleId(snapshot.attribution.spec.rules),
      resourceGroup,
      snapshot.primaryDimension.id,
      value,
    );
    const { projectedResult, projectedCoverage } = this.project(snapshot, rule);
    const proposalId = this.createProposalId();
    this.proposals.set(proposalId, {
      proposalId,
      fingerprint: fingerprint(snapshot.attribution),
      resourceGroup,
      value,
      rule,
    });
    const newlyAttributedResourceCount =
      snapshot.primaryCoverage.unattributedCount - projectedCoverage.unattributedCount;
    const newlyAttributedMonthlySpend =
      snapshot.primaryCoverage.unattributedSpend - projectedCoverage.unattributedSpend;
    this.activity({
      kind: 'previewed',
      title: 'Agent preview - no changes yet',
      detail: `${resourceGroup} -> ${value} · ${(snapshot.primaryCoverage.ratio * 100).toFixed(1)}% to ${(projectedCoverage.ratio * 100).toFixed(1)}% · ${newlyAttributedResourceCount} resources.`,
    });
    return {
      proposalId,
      persisted: false,
      rule,
      impact: {
        before: coverageSummary(snapshot.primaryCoverage),
        after: coverageSummary(projectedCoverage),
        newlyAttributedResourceCount,
        newlyAttributedMonthlySpend,
      },
      remainingClusters: this.clusterOutput(snapshot, projectedResult),
    };
  }

  async applyAttributionRule(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const proposalId = requireString(input, 'proposalId', 256);
    const proposal = this.proposals.get(proposalId);
    if (proposal === undefined) {
      throw new CostWebMcpError(
        'proposal_not_found',
        'That proposal is unknown or already used. Preview the rule again before applying it.',
      );
    }
    const snapshot = await this.snapshot();
    if (fingerprint(snapshot.attribution) !== proposal.fingerprint) {
      this.proposals.delete(proposalId);
      throw new CostWebMcpError(
        'stale_proposal',
        'The attribution rules changed after this preview. Inspect the current gaps and preview again.',
      );
    }
    if (!snapshot.primaryDimension.values.includes(proposal.value)) {
      throw new CostWebMcpError('invalid_value', 'The proposed value is no longer allowed.');
    }
    if (
      !this.clusters(snapshot).some((cluster) => cluster.resourceGroup === proposal.resourceGroup)
    ) {
      throw new CostWebMcpError(
        'cluster_not_found',
        'The proposed resource group is no longer unattributed. Preview the current state again.',
      );
    }
    if (nextRuleId(snapshot.attribution.spec.rules) !== proposal.rule.id) {
      throw new CostWebMcpError(
        'stale_proposal',
        'The next rule id changed after this preview. Preview the rule again before applying it.',
      );
    }
    const { nextAttribution, projectedResult, projectedCoverage } = this.project(
      snapshot,
      proposal.rule,
    );
    await this.options.repository.writeAttribution(this.options.attributionRef, nextAttribution);
    this.options.onAttributionWritten?.(nextAttribution);
    this.proposals.clear();
    const newlyAttributedResourceCount =
      snapshot.primaryCoverage.unattributedCount - projectedCoverage.unattributedCount;
    const newlyAttributedMonthlySpend =
      snapshot.primaryCoverage.unattributedSpend - projectedCoverage.unattributedSpend;
    this.activity({
      kind: 'applied',
      title: `Agent applied ${proposal.rule.id}`,
      detail: `${newlyAttributedResourceCount} resources · $${newlyAttributedMonthlySpend.toLocaleString('en-US')}/mo newly attributed · ${(projectedCoverage.ratio * 100).toFixed(1)}% coverage.`,
    });
    return {
      proposalId,
      persisted: true,
      rule: proposal.rule,
      impact: {
        before: coverageSummary(snapshot.primaryCoverage),
        after: coverageSummary(projectedCoverage),
        newlyAttributedResourceCount,
        newlyAttributedMonthlySpend,
      },
      remainingClusters: this.clusterOutput(snapshot, projectedResult),
    };
  }
}

function closedObjectSchema(
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

async function executeTool(
  service: CostWebMcpService,
  operation: () => Promise<Record<string, unknown>>,
  options?: { signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  try {
    if (options?.signal?.aborted === true) {
      throw new CostWebMcpError('cancelled', 'The tool call was cancelled.');
    }
    return { ok: true, ...(await operation()) };
  } catch (error) {
    const details = errorDetails(error);
    service.reportError(details.message);
    return { ok: false, error: details };
  }
}

export function createCostWebMcpTools(service: CostWebMcpService): WebMcpToolDefinition[] {
  const readAnnotations = { readOnlyHint: true, untrustedContentHint: false };
  const groupProperty = {
    type: 'string',
    minLength: 1,
    maxLength: 128,
    description: 'An exact resource-group name returned by list_unattributed_clusters.',
  };
  return [
    {
      name: 'get_cost_overview',
      title: 'Get cost overview',
      description:
        'Read the current in-browser cloud estate, total spend, attribution coverage, primary dimension, allowed values, and rule count. Does not change the page.',
      inputSchema: closedObjectSchema(),
      annotations: readAnnotations,
      execute: (_input, options) => executeTool(service, () => service.getOverview(), options),
    },
    {
      name: 'list_unattributed_clusters',
      title: 'List unattributed clusters',
      description:
        'List the current resource-group clusters that have no value on the primary cost-attribution dimension, sorted by monthly spend. Does not change the page.',
      inputSchema: closedObjectSchema(),
      annotations: readAnnotations,
      execute: (_input, options) =>
        executeTool(service, () => service.listUnattributedClusters(), options),
    },
    {
      name: 'inspect_unattributed_cluster',
      title: 'Inspect unattributed cluster',
      description:
        'Inspect the resources, spend, tags, and other assignments in one currently unattributed resource-group cluster. Does not change the page.',
      inputSchema: closedObjectSchema({ resourceGroup: groupProperty }, ['resourceGroup']),
      annotations: readAnnotations,
      execute: (input, options) =>
        executeTool(service, () => service.inspectUnattributedCluster(input), options),
    },
    {
      name: 'preview_attribution_rule',
      title: 'Preview attribution rule',
      description:
        'Preview an append-only rule for one currently unattributed resource group. Returns exact before/after coverage and an opaque proposalId, but does not persist any change. Preview before applying.',
      inputSchema: closedObjectSchema(
        {
          resourceGroup: groupProperty,
          value: {
            type: 'string',
            enum: ['workspec', 'atrium', 'coffers', 'shared'],
            description: 'The product value to assign to the whole resource-group cluster.',
          },
        },
        ['resourceGroup', 'value'],
      ),
      annotations: readAnnotations,
      execute: (input, options) =>
        executeTool(service, () => service.previewAttributionRule(input), options),
    },
    {
      name: 'apply_attribution_rule',
      title: 'Apply previewed attribution rule',
      description:
        'WRITE ACTION: persist exactly one previously previewed attribution rule to the current in-browser demo. Requires the proposalId from preview_attribution_rule, rejects stale state, and immediately updates the visible Cost workbench.',
      inputSchema: closedObjectSchema(
        {
          proposalId: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
            description: 'The opaque proposalId returned by preview_attribution_rule.',
          },
        },
        ['proposalId'],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input, options) =>
        executeTool(service, () => service.applyAttributionRule(input), options),
    },
  ];
}

const registrationTails = new WeakMap<WebMcpModelContext, Promise<void>>();

/**
 * Register as one ordered batch. Serialising batches per document avoids the
 * abort/re-register race React Strict Mode can otherwise expose in development.
 */
export function registerCostWebMcpTools(
  context: WebMcpModelContext,
  service: CostWebMcpService,
  signal: AbortSignal,
): Promise<void> {
  const prior = registrationTails.get(context) ?? Promise.resolve();
  const current = prior
    .catch(() => undefined)
    .then(async () => {
      if (signal.aborted) return;
      for (const tool of createCostWebMcpTools(service)) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
    });
  registrationTails.set(context, current);
  const clearTail = () => {
    if (registrationTails.get(context) === current) registrationTails.delete(context);
  };
  void current.then(clearTail, clearTail);
  return current;
}
