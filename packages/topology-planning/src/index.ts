import { z } from 'zod';
import { defineArtifact, Slug } from '@workspec/schema-core';
import { stringify } from 'yaml';

export const INFRASTRUCTURE_KINDS = [
  'compute', 'database', 'messaging', 'storage', 'cache', 'observability', 'edge', 'identity',
] as const;
export const InfrastructureKind = z.enum(INFRASTRUCTURE_KINDS);
export const RequirementSize = z.enum(['small', 'medium', 'large']);

export const InfrastructureRequirement = z.object({
  id: Slug,
  name: z.string().min(1),
  kind: InfrastructureKind,
  realizes: z.array(Slug).min(1),
  environments: z.array(Slug).min(1),
  size: RequirementSize.default('medium'),
  quantity: z.number().int().positive().default(1),
  availability: z.enum(['standard', 'high']).default('standard'),
  notes: z.string().optional(),
}).strict();

export const InfrastructureConnection = z.object({
  from: Slug,
  to: Slug,
  description: z.string().optional(),
}).strict();

export const InfrastructurePlanSpec = z.object({
  title: z.string().min(1),
  sourceDiagram: Slug.optional(),
  environments: z.array(Slug).min(1),
  requirements: z.array(InfrastructureRequirement),
  connections: z.array(InfrastructureConnection).default([]),
}).strict();

export const InfrastructurePlanArtifact = defineArtifact('InfrastructurePlan', InfrastructurePlanSpec);

export type InfrastructureRequirement = z.infer<typeof InfrastructureRequirement>;
export type InfrastructureConnection = z.infer<typeof InfrastructureConnection>;
export type InfrastructurePlan = z.infer<typeof InfrastructurePlanArtifact>;
export type InfrastructureKind = z.infer<typeof InfrastructureKind>;
export type RequirementSize = z.infer<typeof RequirementSize>;
export type CloudProvider = 'azure' | 'aws';

export interface C4PlanningElement {
  id: string;
  kind: string;
  name: string;
  technology?: string;
}

export interface C4PlanningRelationship { from: string; to: string; description?: string }

export interface ProviderLine {
  requirementId: string;
  requirementName: string;
  provider: CloudProvider;
  service: string;
  sku: string;
  monthlyByEnvironment: Record<string, number>;
  monthlyTotal: number;
  rationale: string;
}

export interface ProviderOption {
  provider: CloudProvider;
  name: string;
  currency: 'USD';
  asOf: string;
  lines: ProviderLine[];
  monthlyByEnvironment: Record<string, number>;
  monthlyTotal: number;
}

const KIND_BY_C4: Record<string, InfrastructureKind | undefined> = {
  container: 'compute',
  component: 'compute',
  database: 'database',
  queue: 'messaging',
};

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requirement';
}

export function deriveInfrastructurePlan(
  title: string,
  elements: readonly C4PlanningElement[],
  environments: readonly string[] = ['dev', 'prod'],
  relationships: readonly C4PlanningRelationship[] = [],
): InfrastructurePlan {
  const requirements = elements.flatMap((element): InfrastructureRequirement[] => {
    const kind = KIND_BY_C4[element.kind];
    if (kind === undefined) return [];
    return [{
      id: slug(element.id),
      name: element.name,
      kind,
      realizes: [slug(element.id)],
      environments: [...environments],
      size: element.kind === 'database' ? 'medium' : 'small',
      quantity: 1,
      availability: 'standard',
      ...(element.technology ? { notes: element.technology } : {}),
    }];
  });
  const requirementIds = new Set(requirements.map((item) => item.id));
  const connections = relationships.flatMap((item): InfrastructureConnection[] => {
    const from = slug(item.from);
    const to = slug(item.to);
    if (!requirementIds.has(from) || !requirementIds.has(to) || from === to) return [];
    return [{ from, to, ...(item.description ? { description: item.description } : {}) }];
  });
  return InfrastructurePlanArtifact.parse({
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'InfrastructurePlan',
    metadata: { slug: 'infrastructure' },
    spec: { title: `${title} infrastructure plan`, sourceDiagram: 'container', environments, requirements, connections },
  });
}

interface Mapping { service: string; sku: Record<RequirementSize, string>; monthly: Record<RequirementSize, number>; rationale: string }

const MAPPINGS: Record<CloudProvider, Record<InfrastructureKind, Mapping>> = {
  azure: {
    compute: { service: 'Azure Container Apps', sku: { small: 'Consumption 0.5 vCPU', medium: 'Consumption 1 vCPU', large: 'Consumption 2 vCPU' }, monthly: { small: 42, medium: 85, large: 170 }, rationale: 'Managed container hosting with scale-to-zero and straightforward service boundaries.' },
    database: { service: 'Azure Database for PostgreSQL', sku: { small: 'B1ms', medium: 'D2ds v5', large: 'D4ds v5' }, monthly: { small: 48, medium: 190, large: 410 }, rationale: 'Managed PostgreSQL with backups and an HA upgrade path.' },
    messaging: { service: 'Azure Service Bus', sku: { small: 'Basic', medium: 'Standard', large: 'Premium MU' }, monthly: { small: 10, medium: 55, large: 685 }, rationale: 'Durable queues and topics with native Azure integration.' },
    storage: { service: 'Azure Blob Storage', sku: { small: 'LRS Hot', medium: 'ZRS Hot', large: 'GRS Hot' }, monthly: { small: 12, medium: 38, large: 92 }, rationale: 'Managed object storage with selectable redundancy.' },
    cache: { service: 'Azure Managed Redis', sku: { small: 'C0', medium: 'C1', large: 'P1' }, monthly: { small: 42, medium: 105, large: 420 }, rationale: 'Managed cache with familiar Redis semantics.' },
    observability: { service: 'Azure Monitor', sku: { small: '5 GB ingestion', medium: '20 GB ingestion', large: '75 GB ingestion' }, monthly: { small: 18, medium: 62, large: 210 }, rationale: 'Integrated logs, metrics, traces, and alerting.' },
    edge: { service: 'Azure Front Door', sku: { small: 'Standard', medium: 'Standard', large: 'Premium' }, monthly: { small: 35, medium: 75, large: 330 }, rationale: 'Global edge routing and web application protection.' },
    identity: { service: 'Microsoft Entra ID', sku: { small: 'Free', medium: 'P1', large: 'P2' }, monthly: { small: 0, medium: 72, large: 108 }, rationale: 'Managed workforce and workload identity.' },
  },
  aws: {
    compute: { service: 'AWS App Runner', sku: { small: '1 vCPU / 2 GB', medium: '2 vCPU / 4 GB', large: '4 vCPU / 8 GB' }, monthly: { small: 46, medium: 92, large: 184 }, rationale: 'Managed container hosting with automatic deployment and scaling.' },
    database: { service: 'Amazon RDS for PostgreSQL', sku: { small: 'db.t4g.small', medium: 'db.m7g.large', large: 'db.m7g.xlarge' }, monthly: { small: 56, medium: 212, large: 438 }, rationale: 'Managed PostgreSQL with Multi-AZ and mature operational tooling.' },
    messaging: { service: 'Amazon SQS + SNS', sku: { small: 'Standard 1M', medium: 'Standard 10M', large: 'Standard 100M' }, monthly: { small: 8, medium: 48, large: 390 }, rationale: 'Durable decoupling with simple queue and pub/sub primitives.' },
    storage: { service: 'Amazon S3', sku: { small: 'Standard 250 GB', medium: 'Standard 1 TB', large: 'Standard 5 TB' }, monthly: { small: 11, medium: 36, large: 118 }, rationale: 'Durable object storage with broad ecosystem support.' },
    cache: { service: 'Amazon ElastiCache', sku: { small: 'cache.t4g.small', medium: 'cache.m7g.large', large: 'cache.r7g.xlarge' }, monthly: { small: 38, medium: 122, large: 360 }, rationale: 'Managed cache with Multi-AZ options.' },
    observability: { service: 'Amazon CloudWatch', sku: { small: '5 GB ingestion', medium: '20 GB ingestion', large: '75 GB ingestion' }, monthly: { small: 20, medium: 68, large: 225 }, rationale: 'Native AWS logs, metrics, traces, and alerting.' },
    edge: { service: 'Amazon CloudFront', sku: { small: 'Standard', medium: 'Standard', large: 'Security Savings Bundle' }, monthly: { small: 32, medium: 70, large: 305 }, rationale: 'Global content delivery and edge protection.' },
    identity: { service: 'AWS IAM Identity Center', sku: { small: 'Included', medium: 'Included', large: 'Included' }, monthly: { small: 0, medium: 0, large: 0 }, rationale: 'Central workforce access across AWS accounts.' },
  },
};

export function compareProviders(plan: InfrastructurePlan, asOf = '2026-09-03'): ProviderOption[] {
  return (['azure', 'aws'] as const).map((provider) => {
    const lines = plan.spec.requirements.map((requirement): ProviderLine => {
      const mapping = MAPPINGS[provider][requirement.kind];
      const monthlyByEnvironment = Object.fromEntries(plan.spec.environments.map((env) => {
        const active = requirement.environments.includes(env);
        const schedule = env === 'prod' ? 1 : 0.35;
        const highAvailability = requirement.availability === 'high' && env === 'prod' ? 2 : 1;
        const amount = active ? mapping.monthly[requirement.size] * requirement.quantity * schedule * highAvailability : 0;
        return [env, Math.round(amount * 100) / 100];
      }));
      return {
        requirementId: requirement.id,
        requirementName: requirement.name,
        provider,
        service: mapping.service,
        sku: mapping.sku[requirement.size],
        monthlyByEnvironment,
        monthlyTotal: Object.values(monthlyByEnvironment).reduce((sum, amount) => sum + amount, 0),
        rationale: mapping.rationale,
      };
    });
    const monthlyByEnvironment = Object.fromEntries(plan.spec.environments.map((env) => [env, lines.reduce((sum, line) => sum + (line.monthlyByEnvironment[env] ?? 0), 0)]));
    return {
      provider,
      name: provider === 'azure' ? 'Microsoft Azure' : 'Amazon Web Services',
      currency: 'USD' as const,
      asOf,
      lines,
      monthlyByEnvironment,
      monthlyTotal: Object.values(monthlyByEnvironment).reduce((sum, amount) => sum + amount, 0),
    };
  });
}

export function serializeInfrastructurePlan(plan: InfrastructurePlan): string {
  return `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/infrastructure-plan.schema.json\n${stringify(plan, { lineWidth: 0 })}`;
}

function resourceKind(kind: InfrastructureKind): string {
  if (kind === 'messaging') return 'compute';
  if (kind === 'observability') return 'monitor';
  return kind;
}

export function buildProviderArtifacts(plan: InfrastructurePlan, option: ProviderOption): Record<string, string> {
  const header = (schema: string, value: unknown): string =>
    `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/${schema}.schema.json\n${stringify(value, { lineWidth: 0 })}`;
  const skuId = (requirementId: string): string => `${option.provider}-${requirementId}`;
  const files: Record<string, string> = {};
  for (const env of plan.spec.environments) {
    files[`.workspec/environments/${env}.yaml`] = header('environment', {
      apiVersion: 'workspec.io/v1alpha1', kind: 'Environment', metadata: { slug: env }, spec: {},
    });
  }
  files[`.workspec/decisions/catalogs/${option.provider}.yaml`] = header('decision/catalog', {
    apiVersion: 'workspec.io/v1alpha1', kind: 'Catalog', metadata: { slug: option.provider },
    spec: {
      name: `${option.name} planning estimate`, currency: option.currency, asOf: option.asOf,
      pricingModes: [{ id: 'payg', label: 'Pay as you go', mult: 1, committed: false }],
      schedules: [{ id: 'always', label: 'Always on', pct: 1 }],
      skus: option.lines.map((line) => ({ id: skuId(line.requirementId), label: `${line.service} · ${line.sku}`, family: line.service, price: Math.round((line.monthlyByEnvironment.prod ?? line.monthlyTotal) * 100) / 100, unit: 'unit / month' })),
    },
  });
  for (const requirement of plan.spec.requirements) {
    const line = option.lines.find((item) => item.requirementId === requirement.id);
    if (!line) continue;
    files[`.workspec/resources/${requirement.id}.yaml`] = header('resource', {
      apiVersion: 'workspec.io/v1alpha1', kind: 'Resource', metadata: { slug: requirement.id },
      spec: {
        name: requirement.name, kind: resourceKind(requirement.kind), type: line.service,
        provider: option.provider, environments: requirement.environments, realizes: requirement.realizes,
        config: { sku: line.sku, availability: requirement.availability },
        cost: { sku: skuId(requirement.id), mode: 'payg', schedule: 'always', qty: requirement.quantity },
        source: { kind: 'derived', from: '.workspec/plans/infrastructure.yaml' },
      },
    });
  }
  files[`.workspec/topologies/${option.provider}.yaml`] = header('topology', {
    apiVersion: 'workspec.io/v1alpha1', kind: 'Topology', metadata: { slug: option.provider },
    spec: {
      title: `${plan.spec.title} · ${option.name}`, provider: option.provider,
      environments: plan.spec.environments, defaultEnvironment: plan.spec.environments.at(-1),
      catalog: option.provider,
      connections: plan.spec.connections.map(({ from, to }) => ({ from, to, class: 'primary' })),
    },
  });
  return files;
}

export function updateRequirement(plan: InfrastructurePlan, id: string, patch: Partial<Pick<InfrastructureRequirement, 'name' | 'size' | 'quantity' | 'availability' | 'notes'>>): InfrastructurePlan {
  return InfrastructurePlanArtifact.parse({
    ...plan,
    spec: { ...plan.spec, requirements: plan.spec.requirements.map((item) => item.id === id ? { ...item, ...patch } : item) },
  });
}
