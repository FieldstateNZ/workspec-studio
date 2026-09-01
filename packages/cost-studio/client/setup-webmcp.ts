import { AttributionArtifact } from '@workspec/cost-schema';
import type { Attribution, CostRepositoryPort, Ref } from '@workspec/cost-schema';
import type { WebMcpModelContext, WebMcpToolDefinition } from '@workspec/cost-ui';

export const COST_SETUP_WEBMCP_TOOL_NAMES = [
  'inspect_cost_setup',
  'create_cost_attribution',
] as const;

function closedObjectSchema(
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

function stringInput(input: Record<string, unknown>, key: string, max = 128): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`"${key}" must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`"${key}" must be at most ${max} characters.`);
  return trimmed;
}

function valuesInput(input: Record<string, unknown>): string[] {
  const values = input.values;
  if (!Array.isArray(values) || values.length === 0 || values.length > 50) {
    throw new Error('"values" must contain between 1 and 50 value ids.');
  }
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`"values[${index}]" must be a non-empty string.`);
    }
    return value.trim();
  });
}

async function safeExecute(operation: () => Promise<Record<string, unknown>>) {
  try {
    return { ok: true, ...(await operation()) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'setup_failed',
        message: error instanceof Error ? error.message : 'Cost setup could not be completed.',
      },
    };
  }
}

export interface CostSetupWebMcpOptions {
  repository: CostRepositoryPort;
  inventoryRef: Ref;
  onAttributionWritten(attributionRef: Ref, attribution: Attribution): void;
}

export class CostSetupWebMcpService {
  constructor(private readonly options: CostSetupWebMcpOptions) {}

  async inspect(): Promise<Record<string, unknown>> {
    const [inventory, spendRefs, attributionRefs] = await Promise.all([
      this.options.repository.readInventory(this.options.inventoryRef),
      this.options.repository.listSpends(),
      this.options.repository.listAttributions(),
    ]);
    const allResourceGroups = [
      ...new Set(inventory.spec.resources.map((r) => r.resourceGroup)),
    ].sort();
    const allSubscriptions = [
      ...new Set(inventory.spec.resources.map((r) => r.subscription)),
    ].sort();
    const tagValues = new Map<string, Set<string>>();
    for (const resource of inventory.spec.resources) {
      for (const [name, value] of Object.entries(resource.tags ?? {})) {
        const values = tagValues.get(name) ?? new Set<string>();
        if (values.size < 50) values.add(value);
        tagValues.set(name, values);
      }
    }
    return {
      inventoryRef: this.options.inventoryRef,
      asOf: inventory.spec.asOf,
      resourceCount: inventory.spec.resources.length,
      subscriptionCount: allSubscriptions.length,
      subscriptions: allSubscriptions.slice(0, 100),
      spendRefs: spendRefs.map((item) => item.ref),
      attributionRefs: attributionRefs.map((item) => item.ref),
      resourceGroupCount: allResourceGroups.length,
      resourceGroups: allResourceGroups.slice(0, 500),
      resourceGroupsTruncated: allResourceGroups.length > 500,
      observedTagKeyCount: tagValues.size,
      observedTags: Object.fromEntries(
        [...tagValues.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(0, 100)
          .map(([name, values]) => [name, [...values].sort()]),
      ),
      observedTagsTruncated: tagValues.size > 100,
      nextAction:
        'Agree a primary reporting dimension and its allowed values with the user, then call create_cost_attribution. No cloud resource is changed by setup.',
    };
  }

  async create(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const slug = stringInput(input, 'slug', 64);
    const name = stringInput(input, 'name', 160);
    const dimensionId = stringInput(input, 'dimensionId', 80);
    const dimensionLabel = stringInput(input, 'dimensionLabel', 160);
    const values = valuesInput(input);
    const ref = `.workspec/attributions/${slug}.yaml`;
    const existing = await this.options.repository.listAttributions();
    if (existing.some((item) => item.ref === ref)) {
      throw new Error(`${ref} already exists; setup never overwrites an attribution.`);
    }
    const attribution = AttributionArtifact.parse({
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Attribution',
      metadata: { slug },
      spec: {
        name,
        dimensions: [{ id: dimensionId, label: dimensionLabel, values }],
        rules: [],
      },
    });
    await this.options.repository.writeAttribution(ref, attribution);
    this.options.onAttributionWritten(ref, attribution);
    return {
      persisted: true,
      attributionRef: ref,
      primaryDimension: attribution.spec.dimensions[0],
      ruleCount: 0,
      nextAction:
        'The workbench and five attribution tools are now available. Inspect gaps and preview rules before applying them.',
    };
  }
}

export function createCostSetupWebMcpTools(
  service: CostSetupWebMcpService,
): WebMcpToolDefinition[] {
  return [
    {
      name: 'inspect_cost_setup',
      title: 'Inspect cost setup',
      description:
        'Read the local stocktake summary, resource groups, subscriptions, and observed tag values before creating the first attribution artifact. Does not change files or Azure.',
      inputSchema: closedObjectSchema(),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => safeExecute(() => service.inspect()),
    },
    {
      name: 'create_cost_attribution',
      title: 'Create cost attribution',
      description:
        'WRITE ACTION: create the first local .workspec attribution artifact with one primary dimension and no rules. Never overwrites an existing attribution and never changes Azure.',
      inputSchema: closedObjectSchema(
        {
          slug: {
            type: 'string',
            maxLength: 64,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
            description: 'Artifact slug, for example estate.',
          },
          name: { type: 'string', minLength: 1, maxLength: 160 },
          dimensionId: {
            type: 'string',
            pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$',
            description: 'Stable dimension id, for example product or costCentre.',
          },
          dimensionLabel: { type: 'string', minLength: 1, maxLength: 160 },
          values: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 80 },
            description: 'Allowed value ids agreed with the user.',
          },
        },
        ['slug', 'name', 'dimensionId', 'dimensionLabel', 'values'],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => safeExecute(() => service.create(input)),
    },
  ];
}

export async function registerCostSetupWebMcpTools(
  context: WebMcpModelContext,
  service: CostSetupWebMcpService,
  signal: AbortSignal,
): Promise<void> {
  const prior = setupRegistrationTails.get(context) ?? Promise.resolve();
  const current = prior
    .catch(() => undefined)
    .then(async () => {
      if (signal.aborted) return;
      for (const tool of createCostSetupWebMcpTools(service)) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
    });
  setupRegistrationTails.set(context, current);
  const clearTail = () => {
    if (setupRegistrationTails.get(context) === current) setupRegistrationTails.delete(context);
  };
  void current.then(clearTail, clearTail);
  await current;
}

const setupRegistrationTails = new WeakMap<WebMcpModelContext, Promise<void>>();
