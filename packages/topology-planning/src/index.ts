import { z } from 'zod';
import { defineArtifact, Slug } from '@workspec/schema-core';
import { stringify } from 'yaml';
import {
  CostAnalysis, CostCatalog, SolutionOption, computeAnalysis,
  type CostAnalysis as CostAnalysisType,
  type CostCatalog as CostCatalogType,
  type CostedOption,
  type SolutionOption as SolutionOptionType,
} from '@workspec/cost-catalog';

export { CostAnalysis, CostCatalog, SolutionOption, computeAnalysis } from '@workspec/cost-catalog';
export type { CostAnalysisType as CostAnalysisModel, CostCatalogType as CostCatalogModel, CostedOption, SolutionOptionType as SolutionOptionModel };

export const INFRASTRUCTURE_KINDS = ['compute', 'database', 'messaging', 'storage', 'cache', 'observability', 'edge', 'identity'] as const;
export const InfrastructureKind = z.enum(INFRASTRUCTURE_KINDS);
export const RequirementSize = z.enum(['small', 'medium', 'large']);
export const InfrastructureRequirement = z.object({
  id: Slug, name: z.string().min(1), kind: InfrastructureKind, realizes: z.array(Slug).min(1),
  environments: z.array(Slug).min(1), size: RequirementSize.default('medium'), quantity: z.number().int().positive().default(1),
  availability: z.enum(['standard', 'high']).default('standard'), notes: z.string().optional(),
}).strict();
export const InfrastructureConnection = z.object({ from: Slug, to: Slug, description: z.string().optional() }).strict();
export const InfrastructurePlanSpec = z.object({ title: z.string().min(1), sourceDiagram: Slug.optional(), environments: z.array(Slug).min(1), requirements: z.array(InfrastructureRequirement), connections: z.array(InfrastructureConnection).default([]) }).strict();
export const InfrastructurePlanArtifact = defineArtifact('InfrastructurePlan', InfrastructurePlanSpec);

export type InfrastructureRequirement = z.infer<typeof InfrastructureRequirement>;
export type InfrastructureConnection = z.infer<typeof InfrastructureConnection>;
export type InfrastructurePlan = z.infer<typeof InfrastructurePlanArtifact>;
export type InfrastructureKind = z.infer<typeof InfrastructureKind>;
export type RequirementSize = z.infer<typeof RequirementSize>;
export type SolutionOptionId = string;
/** @deprecated Use SolutionOptionId. Kept source-compatible without a fixed provider union. */
export type CloudProvider = string;
/** @deprecated Compare CostedOption records instead. */
export type ProviderOption = CostedOption;

export interface C4PlanningElement { id: string; kind: string; name: string; technology?: string }
export interface C4PlanningRelationship { from: string; to: string; description?: string }
const KIND_BY_C4: Record<string, InfrastructureKind | undefined> = { container: 'compute', component: 'compute', database: 'database', queue: 'messaging' };
function slug(input: string): string { return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requirement'; }

export function deriveInfrastructurePlan(title: string, elements: readonly C4PlanningElement[], environments: readonly string[] = ['dev', 'prod'], relationships: readonly C4PlanningRelationship[] = []): InfrastructurePlan {
  const requirements = elements.flatMap((element): InfrastructureRequirement[] => {
    const kind = KIND_BY_C4[element.kind]; if (kind === undefined) return [];
    return [{ id: slug(element.id), name: element.name, kind, realizes: [slug(element.id)], environments: [...environments], size: element.kind === 'database' ? 'medium' : 'small', quantity: 1, availability: 'standard', ...(element.technology ? { notes: element.technology } : {}) }];
  });
  const ids = new Set(requirements.map((item) => item.id));
  const connections = relationships.flatMap((item): InfrastructureConnection[] => {
    const from = slug(item.from); const to = slug(item.to);
    return ids.has(from) && ids.has(to) && from !== to ? [{ from, to, ...(item.description ? { description: item.description } : {}) }] : [];
  });
  return InfrastructurePlanArtifact.parse({ apiVersion: 'workspec.io/v1alpha1', kind: 'InfrastructurePlan', metadata: { slug: 'infrastructure' }, spec: { title: `${title} infrastructure plan`, sourceDiagram: 'container', environments, requirements, connections } });
}

interface SeedMapping { service: string; rates: Record<RequirementSize, number>; skus: Record<RequirementSize, string>; rationale: string }
interface SeedProvider { name: string; region: string; mappings: Record<InfrastructureKind, SeedMapping> }
const map = (service: string, small: [string, number], medium: [string, number], large: [string, number], rationale: string): SeedMapping => ({ service, skus: { small: small[0], medium: medium[0], large: large[0] }, rates: { small: small[1], medium: medium[1], large: large[1] }, rationale });
const SEED: Record<string, SeedProvider> = {
  azure: { name: 'Microsoft Azure', region: 'eastus', mappings: {
    compute: map('Azure Container Apps', ['Consumption 0.5 vCPU', 42], ['Consumption 1 vCPU', 85], ['Consumption 2 vCPU', 170], 'Managed container hosting with scale-to-zero.'),
    database: map('Azure Database for PostgreSQL', ['B1ms', 48], ['D2ds v5', 190], ['D4ds v5', 410], 'Managed PostgreSQL with backups and an HA path.'),
    messaging: map('Azure Service Bus', ['Basic', 10], ['Standard', 55], ['Premium MU', 685], 'Durable queues and topics.'),
    storage: map('Azure Blob Storage', ['LRS Hot', 12], ['ZRS Hot', 38], ['GRS Hot', 92], 'Managed object storage.'),
    cache: map('Azure Managed Redis', ['C0', 42], ['C1', 105], ['P1', 420], 'Managed Redis-compatible cache.'),
    observability: map('Azure Monitor', ['5 GB ingestion', 18], ['20 GB ingestion', 62], ['75 GB ingestion', 210], 'Integrated logs, metrics, and traces.'),
    edge: map('Azure Front Door', ['Standard', 35], ['Standard', 75], ['Premium', 330], 'Global edge routing and protection.'),
    identity: map('Microsoft Entra ID', ['Free', 0], ['P1', 72], ['P2', 108], 'Managed workforce and workload identity.'),
  }},
  aws: { name: 'Amazon Web Services', region: 'us-east-1', mappings: {
    compute: map('AWS App Runner', ['1 vCPU / 2 GB', 46], ['2 vCPU / 4 GB', 92], ['4 vCPU / 8 GB', 184], 'Managed container hosting with automatic scaling.'),
    database: map('Amazon RDS for PostgreSQL', ['db.t4g.small', 56], ['db.m7g.large', 212], ['db.m7g.xlarge', 438], 'Managed PostgreSQL with Multi-AZ.'),
    messaging: map('Amazon SQS + SNS', ['Standard 1M', 8], ['Standard 10M', 48], ['Standard 100M', 390], 'Durable queue and pub/sub primitives.'),
    storage: map('Amazon S3', ['Standard 250 GB', 11], ['Standard 1 TB', 36], ['Standard 5 TB', 118], 'Durable object storage.'),
    cache: map('Amazon ElastiCache', ['cache.t4g.small', 38], ['cache.m7g.large', 122], ['cache.r7g.xlarge', 360], 'Managed cache with Multi-AZ options.'),
    observability: map('Amazon CloudWatch', ['5 GB ingestion', 20], ['20 GB ingestion', 68], ['75 GB ingestion', 225], 'Native logs, metrics, traces, and alerts.'),
    edge: map('Amazon CloudFront', ['Standard', 32], ['Standard', 70], ['Security Savings Bundle', 305], 'Global delivery and edge protection.'),
    identity: map('AWS IAM Identity Center', ['Included', 0], ['Included', 0], ['Included', 0], 'Central workforce access.'),
  }},
};
const CATEGORY: Record<InfrastructureKind, string> = { compute: 'compute', database: 'data', messaging: 'platform', storage: 'data', cache: 'data', observability: 'platform', edge: 'network', identity: 'platform' };

function linesForProvider(plan: InfrastructurePlan, providerId: string): SolutionOptionType['lines'] {
  const provider = SEED[providerId]; if (!provider) return [];
  return plan.spec.requirements.flatMap((requirement) => requirement.environments.map((environment) => ({
    id: `${requirement.id}-${environment}`, requirementId: requirement.id, label: `${requirement.name} · ${environment}`,
    kind: 'resource' as const, skuId: `${providerId}-${requirement.kind}-${requirement.size}`, pricingModelId: 'payg',
    scheduleId: environment === 'prod' ? 'always' : 'development', region: provider.region,
    quantities: { [environment]: requirement.quantity * (environment === 'prod' && requirement.availability === 'high' ? 2 : 1) },
  })));
}

export function seedCostAnalysis(plan: InfrastructurePlan, asOf = '2026-09-03'): CostAnalysisType {
  const providers = Object.entries(SEED).map(([id, provider]) => ({ id, name: provider.name, code: id, currency: 'USD', regions: [provider.region] }));
  const resources = Object.entries(SEED).flatMap(([providerId, provider]) => Object.entries(provider.mappings).map(([kind, mapping]) => ({ id: `${providerId}-${kind}`, providerId, name: mapping.service, category: CATEGORY[kind as InfrastructureKind], unit: 'unit / month', billingDimension: 'period' as const, chargeable: true })));
  const skus = Object.entries(SEED).flatMap(([providerId, provider]) => Object.entries(provider.mappings).flatMap(([kind, mapping]) => (['small', 'medium', 'large'] as const).map((size) => ({ id: `${providerId}-${kind}-${size}`, resourceId: `${providerId}-${kind}`, name: mapping.skus[size], spec: size, baseRate: mapping.rates[size], includedQuantity: 0, currency: 'USD', status: 'verified' as const, verifiedAt: asOf, source: 'WorkSpec seeded planning catalog' }))));
  return CostAnalysis.parse({
    catalog: { version: 1, displayCurrency: 'USD', asOf, providers, resources, skus, pricingModels: [{ id: 'payg', name: 'Pay as you go', type: 'ondemand', schedulable: true, currency: 'USD' }], rateOverrides: [], schedules: [{ id: 'always', name: 'Always on', manualPct: 100 }, { id: 'development', name: 'Development schedule', manualPct: 35 }], environments: plan.spec.environments.map((id, sortOrder) => ({ id, name: id === 'prod' ? 'Production' : id === 'dev' ? 'Development' : id, sortOrder })) },
    options: [
      { id: 'azure-container-apps', name: 'Azure Container Apps', archetype: 'Managed application platform', summary: 'A managed container platform on Microsoft Azure.', environments: plan.spec.environments, lines: linesForProvider(plan, 'azure') },
      { id: 'aws-app-runner', name: 'AWS App Runner', archetype: 'Managed application platform', summary: 'A managed container platform on Amazon Web Services.', environments: plan.spec.environments, lines: linesForProvider(plan, 'aws') },
    ],
  });
}

export function reconcileCostAnalysis(plan: InfrastructurePlan, current?: CostAnalysisType): CostAnalysisType {
  if (!current) return seedCostAnalysis(plan);
  const catalog = CostCatalog.parse(current.catalog);
  const options = current.options.map((option) => {
    const firstSku = catalog.skus.find((sku) => sku.id === option.lines.find((line) => line.skuId)?.skuId);
    const providerId = catalog.resources.find((resource) => resource.id === firstSku?.resourceId)?.providerId;
    if (!providerId || !SEED[providerId]) return SolutionOption.parse({ ...option, environments: plan.spec.environments });
    const existing = new Map(option.lines.map((line) => {
      const environment = Object.keys(line.quantities ?? line.amounts ?? {})[0] ?? '';
      return [`${line.requirementId}:${environment}`, line] as const;
    }));
    const lines = linesForProvider(plan, providerId).map((fresh) => {
      const environment = Object.keys(fresh.quantities ?? {})[0] ?? '';
      const prior = existing.get(`${fresh.requirementId}:${environment}`);
      return prior ? { ...prior, id: fresh.id, label: fresh.label, quantities: fresh.quantities } : fresh;
    });
    return SolutionOption.parse({ ...option, environments: plan.spec.environments, lines });
  });
  return CostAnalysis.parse({ catalog, options });
}

export function duplicateSolutionOption(analysis: CostAnalysisType, optionId: string): CostAnalysisType {
  const source = analysis.options.find((option) => option.id === optionId); if (!source) throw new Error(`Unknown solution option: ${optionId}`);
  let id = `${source.id}-alternative`; let suffix = 2;
  while (analysis.options.some((option) => option.id === id)) id = `${source.id}-alternative-${suffix++}`;
  return CostAnalysis.parse({ ...analysis, options: [...analysis.options, { ...source, id, name: `${source.name} alternative`, summary: 'A separately modelled approach using the same provider catalog.' }] });
}
export function renameSolutionOption(analysis: CostAnalysisType, optionId: string, name: string): CostAnalysisType {
  return CostAnalysis.parse({ ...analysis, options: analysis.options.map((option) => option.id === optionId ? { ...option, name } : option) });
}
export function setOptionRequirementSku(analysis: CostAnalysisType, optionId: string, requirementId: string, skuId: string): CostAnalysisType {
  if (!analysis.catalog.skus.some((sku) => sku.id === skuId)) throw new Error(`Unknown catalog SKU: ${skuId}`);
  return CostAnalysis.parse({ ...analysis, options: analysis.options.map((option) => option.id === optionId ? { ...option, lines: option.lines.map((line) => line.requirementId === requirementId ? { ...line, skuId } : line) } : option) });
}

export function createSolutionOption(analysis: CostAnalysisType, plan: InfrastructurePlan, providerId?: string): CostAnalysisType {
  const provider = analysis.catalog.providers.find((item) => item.id === providerId) ?? analysis.catalog.providers[0];
  if (!provider) throw new Error('Add a provider to the cost catalog before creating a solution option.');
  const categoryByKind: Record<InfrastructureKind, string> = { compute: 'compute', database: 'data', messaging: 'platform', storage: 'data', cache: 'data', observability: 'platform', edge: 'network', identity: 'platform' };
  const firstSchedule = analysis.catalog.schedules[0];
  const firstModel = analysis.catalog.pricingModels.find((item) => !item.providerId || item.providerId === provider.id);
  const lines = plan.spec.requirements.flatMap((requirement) => {
    const sku = analysis.catalog.skus.find((item) => analysis.catalog.resources.find((resource) => resource.id === item.resourceId)?.providerId === provider.id && analysis.catalog.resources.find((resource) => resource.id === item.resourceId)?.category === categoryByKind[requirement.kind]);
    if (!sku) return [];
    return requirement.environments.map((environment) => ({ id: `${requirement.id}-${environment}`, requirementId: requirement.id, label: `${requirement.name} · ${environment}`, kind: 'resource' as const, skuId: sku.id, pricingModelId: firstModel?.id, scheduleId: firstSchedule?.id, region: provider.regions[0], quantities: { [environment]: requirement.quantity } }));
  });
  const base = slug(`${provider.code}-option`); let id = base; let suffix = 2;
  while (analysis.options.some((item) => item.id === id)) id = `${base}-${suffix++}`;
  return CostAnalysis.parse({ ...analysis, options: [...analysis.options, { id, name: `${provider.name} option`, archetype: 'Catalog-backed solution', summary: `A solution mapped to the ${provider.name} catalog.`, environments: plan.spec.environments, lines }] });
}

export function updateSolutionLine(
  analysis: CostAnalysisType,
  optionId: string,
  lineId: string,
  patch: Partial<Pick<SolutionOptionType['lines'][number], 'pricingModelId' | 'scheduleId' | 'region' | 'quantities'>>,
): CostAnalysisType {
  return CostAnalysis.parse({
    ...analysis,
    options: analysis.options.map((option) => option.id === optionId
      ? { ...option, lines: option.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line) }
      : option),
  });
}

export function serializeInfrastructurePlan(plan: InfrastructurePlan): string { return `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/infrastructure-plan.schema.json\n${stringify(plan, { lineWidth: 0 })}`; }
export function serializeCostCatalog(catalog: CostCatalogType): string { return `# WorkSpec provider-agnostic project cost catalog\n${stringify(CostCatalog.parse(catalog), { lineWidth: 0 })}`; }
export function serializeSolutionOption(option: SolutionOptionType): string { return `# WorkSpec costed solution option\n${stringify(SolutionOption.parse(option), { lineWidth: 0 })}`; }

function resourceKind(kind: InfrastructureKind): string { return kind === 'messaging' ? 'compute' : kind === 'observability' ? 'monitor' : kind; }
export function buildSolutionArtifacts(plan: InfrastructurePlan, analysis: CostAnalysisType, optionId: string): Record<string, string> {
  const option = analysis.options.find((item) => item.id === optionId); if (!option) throw new Error(`Unknown solution option: ${optionId}`);
  const computed = computeAnalysis(analysis).find((item) => item.option.id === optionId); if (!computed?.complete) throw new Error('Resolve every catalog reference before materialising this solution.');
  const header = (schema: string, value: unknown): string => `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/${schema}.schema.json\n${stringify(value, { lineWidth: 0 })}`;
  const files: Record<string, string> = {};
  for (const env of plan.spec.environments) files[`.workspec/environments/${env}.yaml`] = header('environment', { apiVersion: 'workspec.io/v1alpha1', kind: 'Environment', metadata: { slug: env }, spec: {} });
  for (const requirement of plan.spec.requirements) {
    const line = option.lines.find((item) => item.requirementId === requirement.id && item.kind === 'resource');
    const sku = analysis.catalog.skus.find((item) => item.id === line?.skuId);
    const resource = analysis.catalog.resources.find((item) => item.id === sku?.resourceId);
    const provider = analysis.catalog.providers.find((item) => item.id === resource?.providerId);
    files[`.workspec/resources/${requirement.id}.yaml`] = header('resource', { apiVersion: 'workspec.io/v1alpha1', kind: 'Resource', metadata: { slug: requirement.id }, spec: { name: requirement.name, kind: resourceKind(requirement.kind), type: resource?.name ?? requirement.kind, provider: provider?.code ?? 'unresolved', environments: requirement.environments, realizes: requirement.realizes, config: { sku: sku?.name, availability: requirement.availability }, cost: { sku: line?.skuId, mode: line?.pricingModelId, schedule: line?.scheduleId, qty: requirement.quantity }, source: { kind: 'derived', from: '.workspec/plans/infrastructure.yaml' } } });
  }
  files[`.workspec/topologies/${option.id}.yaml`] = header('topology', { apiVersion: 'workspec.io/v1alpha1', kind: 'Topology', metadata: { slug: option.id }, spec: { title: `${plan.spec.title} · ${option.name}`, provider: computed.providerNames.join(' + ') || 'mixed', environments: plan.spec.environments, defaultEnvironment: plan.spec.environments.at(-1), catalog: 'project-costs', connections: plan.spec.connections.map(({ from, to }) => ({ from, to, class: 'primary' })) } });
  return files;
}

export function updateRequirement(plan: InfrastructurePlan, id: string, patch: Partial<Pick<InfrastructureRequirement, 'name' | 'size' | 'quantity' | 'availability' | 'notes'>>): InfrastructurePlan {
  return InfrastructurePlanArtifact.parse({ ...plan, spec: { ...plan.spec, requirements: plan.spec.requirements.map((item) => item.id === id ? { ...item, ...patch } : item) } });
}
