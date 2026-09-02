import { buildTagPlan } from '@workspec/cost-engine';
import {
  AttributionArtifact,
  InventoryArtifact,
  SpendArtifact,
  TagPlanArtifact,
  compareResourceIds,
  compareSpendRows,
  createMemoryRepository,
  serializeAttributionYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
  serializeTagPlanYaml,
} from '@workspec/cost-schema';
import type {
  Attribution,
  CostRepositoryPort,
  Inventory,
  MemoryRepositorySeed,
  Ref,
  Spend,
} from '@workspec/cost-schema';
import { strToU8, zipSync } from 'fflate';

import type { WebMcpModelContext, WebMcpToolDefinition } from './cost-webmcp.js';

export const COST_SNAPSHOT_TOOL_NAME = 'load_cost_snapshot' as const;
export const COST_SETUP_TOOL_NAMES = ['inspect_cost_setup', 'create_cost_attribution'] as const;

export interface CostEstateState {
  key: number;
  estateName: string;
  period: string;
  inventoryRef: Ref;
  spendRef: Ref;
  attributionRef?: Ref;
  tagPlanRef?: Ref;
  seed: MemoryRepositorySeed;
  imported: boolean;
}

export interface LoadedCostSnapshot {
  estateName: string;
  period: string;
  inventoryRef: Ref;
  spendRef: Ref;
  inventory: Inventory;
  spend: Spend;
}

interface SnapshotResourceInput {
  id: string;
  name: string;
  type: string;
  location: string;
  resourceGroup: string;
  account: string;
  tags?: Record<string, string>;
  monthlySpend: number;
  serviceCategory: string;
}

function requiredString(value: unknown, path: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string.`);
  }
  const result = value.trim();
  if (result.length > max) throw new Error(`${path} must be at most ${max} characters.`);
  return result;
}

function slug(value: string): string {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  if (result === '') throw new Error('estateName must contain at least one letter or number.');
  return result;
}

function parseTags(value: unknown, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object of string tag values.`);
  }
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`${path} must contain at most 100 tags.`);
  return Object.fromEntries(
    entries
      .map(([key, tagValue]): [string, string] => [
        requiredString(key, `${path} key`, 512),
        requiredString(tagValue, `${path}.${key}`, 256),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseResource(value: unknown, index: number): SnapshotResourceInput {
  const path = `resources[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const input = value as Record<string, unknown>;
  const monthlySpend = input.monthlySpend;
  if (typeof monthlySpend !== 'number' || !Number.isFinite(monthlySpend)) {
    throw new Error(`${path}.monthlySpend must be a finite number.`);
  }
  const tags = parseTags(input.tags, `${path}.tags`);
  return {
    id: requiredString(input.id, `${path}.id`, 2048),
    name: requiredString(input.name, `${path}.name`),
    type: requiredString(input.type, `${path}.type`, 512),
    location: requiredString(input.location, `${path}.location`, 128),
    resourceGroup: requiredString(input.resourceGroup, `${path}.resourceGroup`, 256),
    account: requiredString(input.account, `${path}.account`, 256),
    ...(tags !== undefined ? { tags } : {}),
    monthlySpend,
    serviceCategory: requiredString(input.serviceCategory, `${path}.serviceCategory`, 256),
  };
}

export function buildCostSnapshot(input: Record<string, unknown>): LoadedCostSnapshot {
  const estateName = requiredString(input.estateName, 'estateName', 160);
  requiredString(input.provider, 'provider', 64);
  const asOf = requiredString(input.asOf, 'asOf', 64);
  const period = requiredString(input.period, 'period', 7);
  const currency = requiredString(input.currency, 'currency', 3).toUpperCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error('period must be an ISO month in YYYY-MM format.');
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a three-letter code.');
  if (Number.isNaN(Date.parse(asOf))) throw new Error('asOf must be an ISO 8601 timestamp.');
  if (
    !Array.isArray(input.resources) ||
    input.resources.length === 0 ||
    input.resources.length > 1000
  ) {
    throw new Error('resources must contain between 1 and 1000 resources.');
  }
  const resources = input.resources.map(parseResource);
  const ids = new Set(resources.map((resource) => resource.id));
  if (ids.size !== resources.length) throw new Error('resources must have unique ids.');

  const estateSlug = slug(estateName);
  const inventoryRef = '.workspec/inventories/estate.yaml';
  const spendRef = `.workspec/spends/estate-${period}.yaml`;
  const inventory = InventoryArtifact.parse({
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'estate' },
    spec: {
      name: estateName,
      asOf: new Date(asOf).toISOString(),
      scope: { subscriptions: [...new Set(resources.map((resource) => resource.account))].sort() },
      resources: resources
        .map(
          ({
            monthlySpend: _monthlySpend,
            serviceCategory: _serviceCategory,
            account,
            ...resource
          }) => ({
            ...resource,
            subscription: account,
          }),
        )
        .sort((left, right) => compareResourceIds(left.id, right.id)),
    },
  });
  const spend = SpendArtifact.parse({
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { slug: `${estateSlug}-${period}` },
    spec: {
      name: `${estateName} ${period}`,
      rows: resources
        .map((resource) => ({
          resourceId: resource.id,
          amount: resource.monthlySpend,
          currency,
          period,
          serviceCategory: resource.serviceCategory,
        }))
        .sort(compareSpendRows),
    },
  });
  return { estateName, period, inventoryRef, spendRef, inventory, spend };
}

export function createSnapshotRepository(state: CostEstateState): CostRepositoryPort {
  return createMemoryRepository(state.seed);
}

export function stateFromSnapshot(snapshot: LoadedCostSnapshot, key: number): CostEstateState {
  return {
    key,
    estateName: snapshot.estateName,
    period: snapshot.period,
    inventoryRef: snapshot.inventoryRef,
    spendRef: snapshot.spendRef,
    seed: {
      inventories: { [snapshot.inventoryRef]: snapshot.inventory },
      spends: { [snapshot.spendRef]: snapshot.spend },
    },
    imported: true,
  };
}

async function safeExecute(operation: () => Promise<Record<string, unknown>>) {
  try {
    return { ok: true, ...(await operation()) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'snapshot_failed',
        message: error instanceof Error ? error.message : 'The cost snapshot action failed.',
      },
    };
  }
}

export class CostSnapshotWebMcpService {
  constructor(private readonly onLoaded: (snapshot: LoadedCostSnapshot) => void) {}

  load(input: Record<string, unknown>): Record<string, unknown> {
    const snapshot = buildCostSnapshot(input);
    this.onLoaded(snapshot);
    return {
      replaced: true,
      cloudAccessed: false,
      inventoryRef: snapshot.inventoryRef,
      spendRef: snapshot.spendRef,
      estate: snapshot.estateName,
      period: snapshot.period,
      resourceCount: snapshot.inventory.spec.resources.length,
      totalMonthlySpend: snapshot.spend.spec.rows.reduce((sum, row) => sum + row.amount, 0),
      nextAction:
        'Call inspect_cost_setup, agree an attribution dimension with the user, then call create_cost_attribution.',
    };
  }
}

export class CostSetupWebMcpService {
  constructor(
    private readonly repository: CostRepositoryPort,
    private readonly inventoryRef: Ref,
    private readonly onAttributionWritten: (ref: Ref, attribution: Attribution) => void,
  ) {}

  async inspect(): Promise<Record<string, unknown>> {
    const [inventory, spendRefs] = await Promise.all([
      this.repository.readInventory(this.inventoryRef),
      this.repository.listSpends(),
    ]);
    const resourceGroups = [
      ...new Set(inventory.spec.resources.map((resource) => resource.resourceGroup)),
    ].sort();
    const accounts = [
      ...new Set(inventory.spec.resources.map((resource) => resource.subscription)),
    ].sort();
    const observedTags = new Map<string, Set<string>>();
    for (const resource of inventory.spec.resources) {
      for (const [name, value] of Object.entries(resource.tags ?? {})) {
        const values = observedTags.get(name) ?? new Set<string>();
        values.add(value);
        observedTags.set(name, values);
      }
    }
    return {
      inventoryRef: this.inventoryRef,
      spendRefs: spendRefs.map((item) => item.ref),
      asOf: inventory.spec.asOf,
      resourceCount: inventory.spec.resources.length,
      accounts,
      resourceGroups,
      observedTags: Object.fromEntries(
        [...observedTags].map(([key, values]) => [key, [...values].sort()]),
      ),
      nextAction:
        'Agree one primary reporting dimension and its allowed values with the user, then create it. No cloud resource is changed.',
    };
  }

  async create(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = requiredString(input.name, 'name', 160);
    const dimensionId = requiredString(input.dimensionId, 'dimensionId', 80);
    const dimensionLabel = requiredString(input.dimensionLabel, 'dimensionLabel', 160);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(dimensionId))
      throw new Error('dimensionId contains unsupported characters.');
    if (!Array.isArray(input.values) || input.values.length === 0 || input.values.length > 50) {
      throw new Error('values must contain between 1 and 50 values.');
    }
    const values = input.values.map((value, index) =>
      requiredString(value, `values[${index}]`, 80),
    );
    if (new Set(values).size !== values.length) throw new Error('values must be unique.');
    const ref = `.workspec/attributions/${slug(dimensionId)}.yaml`;
    const attribution = AttributionArtifact.parse({
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Attribution',
      metadata: { slug: slug(dimensionId) },
      spec: { name, dimensions: [{ id: dimensionId, label: dimensionLabel, values }], rules: [] },
    });
    await this.repository.writeAttribution(ref, attribution);
    this.onAttributionWritten(ref, attribution);
    return {
      persisted: true,
      cloudAccessed: false,
      attributionRef: ref,
      primaryDimension: attribution.spec.dimensions[0],
      nextAction: 'Inspect unattributed clusters and preview rules before applying them.',
    };
  }
}

const resourceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 2048 },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    type: { type: 'string', minLength: 1, maxLength: 512 },
    location: { type: 'string', minLength: 1, maxLength: 128 },
    resourceGroup: { type: 'string', minLength: 1, maxLength: 256 },
    account: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      description: 'Provider account, subscription, or project id.',
    },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
    monthlySpend: { type: 'number' },
    serviceCategory: { type: 'string', minLength: 1, maxLength: 256 },
  },
  required: [
    'id',
    'name',
    'type',
    'location',
    'resourceGroup',
    'account',
    'monthlySpend',
    'serviceCategory',
  ],
} as const;

export function createSnapshotTool(service: CostSnapshotWebMcpService): WebMcpToolDefinition {
  return {
    name: COST_SNAPSHOT_TOOL_NAME,
    title: 'Load cost snapshot',
    description:
      'WRITE ACTION: replace all current in-browser demo data with a provider-neutral stocktake and monthly spend snapshot. Validates the entire payload before replacing state. Does not access or modify any cloud account.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        estateName: { type: 'string', minLength: 1, maxLength: 160 },
        provider: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'Provider label such as azure, aws, or gcp.',
        },
        asOf: { type: 'string', format: 'date-time' },
        period: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
        currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
        resources: { type: 'array', minItems: 1, maxItems: 1000, items: resourceSchema },
      },
      required: ['estateName', 'provider', 'asOf', 'period', 'currency', 'resources'],
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input) => safeExecute(async () => service.load(input)),
  };
}

export function createSetupTools(service: CostSetupWebMcpService): WebMcpToolDefinition[] {
  return [
    {
      name: 'inspect_cost_setup',
      title: 'Inspect cost setup',
      description:
        'Read the loaded stocktake summary, accounts, resource groups, and observed tags before creating attribution. Does not change state or any cloud account.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => safeExecute(() => service.inspect()),
    },
    {
      name: 'create_cost_attribution',
      title: 'Create cost attribution',
      description:
        'WRITE ACTION: create the in-browser attribution artifact with one primary dimension and no rules. Does not overwrite cloud data or change any cloud account.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          dimensionId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$' },
          dimensionLabel: { type: 'string', minLength: 1, maxLength: 160 },
          values: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
        required: ['name', 'dimensionId', 'dimensionLabel', 'values'],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => safeExecute(() => service.create(input)),
    },
  ];
}

const registrationTails = new WeakMap<WebMcpModelContext, Promise<void>>();

export function registerCostDemoTools(
  context: WebMcpModelContext,
  tools: WebMcpToolDefinition[],
  signal: AbortSignal,
): Promise<void> {
  const prior = registrationTails.get(context) ?? Promise.resolve();
  const current = prior
    .catch(() => undefined)
    .then(async () => {
      if (signal.aborted) return;
      for (const tool of tools) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
    });
  registrationTails.set(context, current);
  const clear = () => {
    if (registrationTails.get(context) === current) registrationTails.delete(context);
  };
  void current.then(clear, clear);
  return current;
}

function tagName(dimensionId: string): string {
  return `workspec-${dimensionId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()}`;
}

export async function buildWorkspecBundle(
  repository: CostRepositoryPort,
  inventoryRef: Ref,
  spendRef: Ref,
  attributionRef: Ref,
  period: string,
): Promise<{ filename: string; bytes: Uint8Array; files: string[] }> {
  const [inventory, spend, attribution] = await Promise.all([
    repository.readInventory(inventoryRef),
    repository.readSpend(spendRef),
    repository.readAttribution(attributionRef),
  ]);
  const primary = attribution.spec.dimensions[0];
  if (primary === undefined) throw new Error('Attribution has no primary dimension.');
  const attributionSlug = slug(primary.id);
  const tagMapping = Object.fromEntries(
    attribution.spec.dimensions.map((dimension) => [dimension.id, tagName(dimension.id)]),
  );
  const tagPlan = TagPlanArtifact.parse(
    buildTagPlan(inventory, attribution, tagMapping, {
      slug: period,
      name: `${inventory.spec.name ?? 'Estate'} ${period} tag plan`,
    }),
  );
  const normalizedInventory = InventoryArtifact.parse({
    ...inventory,
    metadata: { slug: 'estate' },
  });
  const normalizedSpend = SpendArtifact.parse({ ...spend, metadata: { slug: `estate-${period}` } });
  const normalizedAttribution = AttributionArtifact.parse({
    ...attribution,
    metadata: { slug: attributionSlug },
  });
  const files: [string, string, string, string] = [
    '.workspec/inventories/estate.yaml',
    `.workspec/spends/estate-${period}.yaml`,
    `.workspec/attributions/${attributionSlug}.yaml`,
    `.workspec/tagplans/${period}.yaml`,
  ];
  const archive = zipSync({
    [files[0]]: strToU8(serializeInventoryYaml(normalizedInventory)),
    [files[1]]: strToU8(serializeSpendYaml(normalizedSpend)),
    [files[2]]: strToU8(serializeAttributionYaml(normalizedAttribution)),
    [files[3]]: strToU8(serializeTagPlanYaml(tagPlan)),
  });
  return { filename: `workspec-cost-${period}.zip`, bytes: archive, files };
}

export function downloadWorkspecBundle(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
