import { describe, expect, it } from 'vitest';
import { CostAnalysis, computeAnalysis } from './index.js';

const analysis = CostAnalysis.parse({
  catalog: { version: 1, displayCurrency: 'USD', asOf: '2026-09-04', providers: [{ id: 'azure', name: 'Microsoft Azure', code: 'azure', currency: 'USD', regions: [] }], resources: [{ id: 'aca', providerId: 'azure', name: 'Container Apps', category: 'compute', unit: 'unit / month', billingDimension: 'period', chargeable: true }], skus: [{ id: 'aca-small', resourceId: 'aca', name: 'Small', spec: '', baseRate: 100, includedQuantity: 0, status: 'verified', verifiedAt: '2026-09-04', source: 'fixture' }], pricingModels: [{ id: 'payg', name: 'Pay as you go', type: 'ondemand', schedulable: true, currency: 'USD' }], rateOverrides: [], schedules: [{ id: 'always', name: 'Always', manualPct: 100 }], environments: [{ id: 'prod', name: 'Production', sortOrder: 0 }] },
  options: [{ id: 'managed', name: 'Managed container platform', environments: ['prod'], lines: [{ id: 'web-prod', requirementId: 'web', label: 'Web', kind: 'resource', skuId: 'aca-small', pricingModelId: 'payg', scheduleId: 'always', quantities: { prod: 2 } }] }],
});

describe('cost catalog engine', () => {
  it('prices a solution option through catalog references', () => expect(computeAnalysis(analysis)[0]?.monthlyTotal).toBe(200));
  it('surfaces unresolved references rather than silently trusting zero', () => {
    const broken = CostAnalysis.parse(JSON.parse(JSON.stringify(analysis)));
    const firstOption = broken.options[0]; const firstLine = firstOption?.lines[0];
    if (!firstLine) throw new Error('Fixture option line missing');
    firstLine.skuId = 'missing';
    const result = computeAnalysis(broken)[0];
    if (!result) throw new Error('Computed option missing');
    expect(result.complete).toBe(false); expect(result.issues.some((issue) => issue.severity === 'error')).toBe(true);
  });
});
