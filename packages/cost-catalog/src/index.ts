import { z } from 'zod';

export const PricingType = z.enum(['ondemand', 'committed', 'spot', 'tiered', 'usage', 'custom']);
export const CatalogStatus = z.enum(['draft', 'verified', 'stale']);

export const CostProvider = z.object({
  id: z.string().min(1), name: z.string().min(1), code: z.string().min(1),
  currency: z.string().min(1).default('USD'), regions: z.array(z.string()).default([]),
  home: z.string().optional(), note: z.string().optional(),
}).strict();

export const CostResource = z.object({
  id: z.string().min(1), providerId: z.string().min(1), name: z.string().min(1),
  category: z.string().min(1), unit: z.string().min(1).default('unit / month'),
  parentId: z.string().nullable().optional(), lens: z.enum(['cost', 'logical']).default('cost'),
  cardinality: z.enum(['one', 'many']).default('many'), billingDimension: z.enum(['period', 'usage']).default('period'),
  chargeable: z.boolean().default(true), meterGroup: z.string().nullable().optional(), allowedModels: z.array(z.string()).default([]),
}).strict();

export const CostSku = z.object({
  id: z.string().min(1), resourceId: z.string().min(1), name: z.string().min(1),
  spec: z.string().default(''), baseRate: z.number().nonnegative(), currency: z.string().optional(),
  includedQuantity: z.number().nonnegative().default(0), status: CatalogStatus.default('draft'),
  rateBasis: z.string().nullable().optional(), verifiedAt: z.string().optional(), source: z.string().optional(),
  meterId: z.string().nullable().optional(), regionAgnostic: z.boolean().default(false),
  fxRateApplied: z.number().positive().nullable().optional(), fxSourceCurrency: z.string().nullable().optional(),
}).strict();

export const PricingTier = z.object({ upTo: z.number().nonnegative().nullable(), rate: z.number().nonnegative() }).strict();

export const PricingModel = z.object({
  id: z.string().min(1), providerId: z.string().min(1).optional(), name: z.string().min(1),
  type: PricingType, schedulable: z.boolean().default(true), currency: z.string().default('USD'),
  regionModifier: z.number().default(0), effectiveFrom: z.string().optional(), effectiveTo: z.string().optional(),
  rateBasis: z.string().optional(), termMonths: z.number().int().positive().optional(), discountPct: z.number().min(0).max(100).optional(),
  billing: z.string().optional(), upfrontPct: z.number().min(0).max(100).optional(), interruptible: z.boolean().optional(),
  unit: z.string().optional(), rate: z.number().nonnegative().optional(), tiers: z.array(PricingTier).optional(),
  formula: z.string().optional(), derivationFamily: z.string().optional(),
}).strict();

export const SkuRateOverride = z.object({
  id: z.string().min(1), skuId: z.string().min(1), pricingModelId: z.string().min(1).optional(),
  region: z.string().optional(), rate: z.number().nonnegative(), currency: z.string().optional(),
  status: CatalogStatus.default('draft'), verifiedAt: z.string().optional(), source: z.string().optional(),
  rateBasis: z.string().nullable().optional(), meterId: z.string().nullable().optional(),
  fxRateApplied: z.number().positive().nullable().optional(), fxSourceCurrency: z.string().nullable().optional(),
}).strict();

export const CostSchedule = z.object({
  id: z.string().min(1), name: z.string().min(1),
  tz: z.string().default('UTC'),
  days: z.record(z.string(), z.number().min(0).max(1)).default({ mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 }),
  startTime: z.string().default('00:00'), endTime: z.string().default('24:00'),
  manualPct: z.number().min(0).max(100).optional(), note: z.string().optional(),
}).strict();

export const CostEnvironment = z.object({ id: z.string().min(1), name: z.string().min(1), sortOrder: z.number().int() }).strict();
export const CostFxRate = z.object({ id: z.string().min(1), fromCurrency: z.string().min(3), toCurrency: z.string().min(3), rate: z.number().positive(), asOf: z.string().optional(), source: z.string().optional() }).strict();

export const CostCatalog = z.object({
  version: z.literal(1).default(1), displayCurrency: z.string().default('USD'), asOf: z.string().min(1),
  providers: z.array(CostProvider), resources: z.array(CostResource), skus: z.array(CostSku),
  pricingModels: z.array(PricingModel), rateOverrides: z.array(SkuRateOverride).default([]),
  schedules: z.array(CostSchedule), environments: z.array(CostEnvironment), fxRates: z.array(CostFxRate).default([]),
}).strict();

export const SolutionCostLine = z.object({
  id: z.string().min(1), requirementId: z.string().min(1), label: z.string().min(1),
  kind: z.enum(['resource', 'flat']), skuId: z.string().optional(), pricingModelId: z.string().optional(),
  scheduleId: z.string().optional(), region: z.string().optional(),
  quantities: z.record(z.string(), z.number().nonnegative()).optional(),
  amounts: z.record(z.string(), z.number().nonnegative()).optional(), estimate: z.boolean().optional(),
}).strict();

export const SolutionOption = z.object({
  id: z.string().min(1), name: z.string().min(1), archetype: z.string().optional(), summary: z.string().optional(),
  environments: z.array(z.string()).min(1), lines: z.array(SolutionCostLine),
}).strict();

export const CostAnalysis = z.object({ catalog: CostCatalog, options: z.array(SolutionOption) }).strict();

export type CostProvider = z.infer<typeof CostProvider>;
export type CostResource = z.infer<typeof CostResource>;
export type CostSku = z.infer<typeof CostSku>;
export type PricingModel = z.infer<typeof PricingModel>;
export type SkuRateOverride = z.infer<typeof SkuRateOverride>;
export type CostSchedule = z.infer<typeof CostSchedule>;
export type CostEnvironment = z.infer<typeof CostEnvironment>;
export type CostFxRate = z.infer<typeof CostFxRate>;
export type PricingTier = z.infer<typeof PricingTier>;
export type CostCatalog = z.infer<typeof CostCatalog>;
export type SolutionCostLine = z.infer<typeof SolutionCostLine>;
export type SolutionOption = z.infer<typeof SolutionOption>;
export type CostAnalysis = z.infer<typeof CostAnalysis>;

export interface CostIssue { lineId: string; severity: 'error' | 'warning'; message: string }
export interface CostedLine { line: SolutionCostLine; monthlyByEnvironment: Record<string, number>; monthlyTotal: number | null; issues: CostIssue[] }
export interface CostedOption { option: SolutionOption; monthlyByEnvironment: Record<string, number>; monthlyTotal: number; currency: string; providerNames: string[]; lines: CostedLine[]; issues: CostIssue[]; complete: boolean }

const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
function hours(time: string): number { const [h = 0, m = 0] = time.split(':').map(Number); return h + m / 60; }
export function scheduleUptime(schedule: CostSchedule): number {
  if (schedule.manualPct !== undefined) return schedule.manualPct / 100;
  const start = hours(schedule.startTime); const end = hours(schedule.endTime);
  const window = end > start ? end - start : 24 - start + end;
  const days = DOW.reduce((sum, day) => sum + (schedule.days[day] ?? 0), 0);
  return Math.min(1, days * window / (7 * 24));
}

function multiplier(model: PricingModel | undefined): number | null {
  if (!model || model.type === 'ondemand') return 1;
  if (model.type === 'committed' || model.type === 'spot') return (100 - (model.discountPct ?? 0)) / 100;
  return null;
}

function rateFor(sku: CostSku, model: PricingModel | undefined, region: string | undefined, catalog: CostCatalog): number | null {
  const rows = catalog.rateOverrides.filter((item) => item.skuId === sku.id);
  const exact = rows.find((item) => item.pricingModelId === model?.id && item.region === region)
    ?? rows.find((item) => item.pricingModelId === model?.id && item.region === undefined)
    ?? rows.find((item) => item.pricingModelId === undefined && item.region === region);
  if (exact) return exact.rate;
  const factor = multiplier(model); return factor === null ? null : sku.baseRate * factor;
}

export function computeOption(optionInput: SolutionOption, catalogInput: CostCatalog): CostedOption {
  const option = SolutionOption.parse(optionInput); const catalog = CostCatalog.parse(catalogInput);
  const environments = option.environments;
  const totals = Object.fromEntries(environments.map((id) => [id, 0]));
  const providers = new Set<string>();
  const lines = option.lines.map((line): CostedLine => {
    const issues: CostIssue[] = [];
    const amounts = Object.fromEntries(environments.map((id) => [id, 0]));
    if (line.kind === 'flat') {
      for (const env of environments) amounts[env] = line.amounts?.[env] ?? 0;
      const monthlyTotal = Object.values(amounts).reduce((sum, value) => sum + value, 0);
      for (const env of environments) totals[env] = (totals[env] ?? 0) + (amounts[env] ?? 0);
      return { line, monthlyByEnvironment: amounts, monthlyTotal, issues };
    }
    const sku = catalog.skus.find((item) => item.id === line.skuId);
    const resource = sku ? catalog.resources.find((item) => item.id === sku.resourceId) : undefined;
    const provider = resource ? catalog.providers.find((item) => item.id === resource.providerId) : undefined;
    const model = catalog.pricingModels.find((item) => item.id === line.pricingModelId);
    const schedule = catalog.schedules.find((item) => item.id === line.scheduleId);
    if (!sku) issues.push({ lineId: line.id, severity: 'error', message: 'SKU is unresolved.' });
    if (!resource || !provider) issues.push({ lineId: line.id, severity: 'error', message: 'Provider resource is unresolved.' });
    if (!model) issues.push({ lineId: line.id, severity: 'error', message: 'Pricing model is unresolved.' });
    if (!schedule) issues.push({ lineId: line.id, severity: 'error', message: 'Schedule is unresolved.' });
    if (sku?.status !== 'verified') issues.push({ lineId: line.id, severity: 'warning', message: `SKU rate is ${sku?.status ?? 'unverified'}.` });
    if (provider) providers.add(provider.name);
    if (issues.some((item) => item.severity === 'error') || !sku || !schedule) return { line, monthlyByEnvironment: amounts, monthlyTotal: null, issues };
    const rate = rateFor(sku, model, line.region, catalog);
    if (rate === null) {
      issues.push({ lineId: line.id, severity: 'error', message: `Pricing type ${model?.type ?? 'unknown'} needs a dedicated meter.` });
      return { line, monthlyByEnvironment: amounts, monthlyTotal: null, issues };
    }
    const scheduleFactor = model?.type === 'committed' ? 1 : scheduleUptime(schedule);
    for (const env of environments) {
      amounts[env] = Math.round(rate * (line.quantities?.[env] ?? 0) * scheduleFactor * 100) / 100;
      totals[env] = (totals[env] ?? 0) + amounts[env];
    }
    return { line, monthlyByEnvironment: amounts, monthlyTotal: Object.values(amounts).reduce((sum, value) => sum + value, 0), issues };
  });
  const issues = lines.flatMap((line) => line.issues);
  return { option, monthlyByEnvironment: totals, monthlyTotal: Object.values(totals).reduce((sum, value) => sum + value, 0), currency: catalog.displayCurrency, providerNames: [...providers], lines, issues, complete: !issues.some((item) => item.severity === 'error') };
}

export function computeAnalysis(input: CostAnalysis): CostedOption[] {
  const analysis = CostAnalysis.parse(input); return analysis.options.map((option) => computeOption(option, analysis.catalog));
}
