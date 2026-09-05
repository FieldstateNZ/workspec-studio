import { useState, type ReactElement } from 'react';
import type { CostAnalysisModel, CostedOption, InfrastructurePlan } from '@workspec/topology-planning';
import { CostCatalogEditor } from '@workspec/cost-catalog-ui';
import '@workspec/cost-catalog-ui/styles.css';
import { CheckCircle2, CircleAlert, CopyPlus, Database, Server, Sparkles } from 'lucide-react';

export interface CostAnalysisEditorProps {
  analysis: CostAnalysisModel;
  plan: InfrastructurePlan;
  computed: readonly CostedOption[];
  onRenameOption: (optionId: string, name: string) => void;
  onDuplicateOption: (optionId: string) => void;
  onSkuChange: (optionId: string, requirementId: string, skuId: string) => void;
  onLineChange: (optionId: string, lineId: string, patch: { pricingModelId?: string; scheduleId?: string; region?: string; quantities?: Record<string, number> }) => void;
  onCreateOption: () => void;
  onCatalogChange: (catalog: CostAnalysisModel['catalog']) => void;
  onContinue?: () => void;
}

const CATEGORY: Record<string, string> = { compute: 'compute', database: 'data', messaging: 'platform', storage: 'data', cache: 'data', observability: 'platform', edge: 'network', identity: 'platform' };
const money = (amount: number, currency: string): string => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export function CostAnalysisEditor({ analysis, plan, computed, onRenameOption, onDuplicateOption, onSkuChange, onLineChange, onCreateOption, onCatalogChange, onContinue }: CostAnalysisEditorProps): ReactElement {
  const [view, setView] = useState<'catalog' | 'options'>('options');
  const resourceById = new Map(analysis.catalog.resources.map((item) => [item.id, item]));
  const providerById = new Map(analysis.catalog.providers.map((item) => [item.id, item]));
  const catalogUsable = analysis.catalog.providers.length > 0 && analysis.catalog.resources.length > 0 && analysis.catalog.skus.length > 0;
  const catalogEmpty = !catalogUsable;
  return <div className="tp-cost-analysis">
    <header className="tp-plan-header"><div><span>03 · Cost analysis</span><h1>Build solution options</h1><p>Map the same provider-neutral requirements to catalog-backed approaches.</p></div><small>Catalog · {analysis.catalog.asOf}</small></header>
    <div className="tp-cost-workspace-tabs" role="tablist"><button type="button" role="tab" aria-selected={view === 'options'} className={view === 'options' ? 'active' : ''} onClick={() => setView('options')}>Solution options <span>{analysis.options.length}</span></button><button type="button" role="tab" aria-selected={view === 'catalog'} className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')}><span aria-hidden="true">⚙</span> Manage catalog</button></div>
    {view === 'catalog' ? <CostCatalogEditor catalog={analysis.catalog} onChange={onCatalogChange}/> : catalogEmpty ? <section className="tp-cost-empty"><Sparkles size={22}/><h2>Populate the cost catalog</h2><p>Pricing resources must be populated before useful solution options can be built. Add providers, resources, SKUs, and pricing models to get started.</p><button type="button" onClick={() => setView('catalog')}>Manage catalog →</button></section> : analysis.options.length === 0 ? <section className="tp-cost-empty"><Sparkles size={22}/><h2>Create your first solution option</h2><p>The catalog is ready. Start with a provider-backed option, then edit its mappings and environment assumptions before comparing it.</p><button type="button" onClick={onCreateOption}>Create solution option →</button><button type="button" className="secondary" onClick={() => setView('catalog')}>Manage catalog</button></section> : <><div className="tp-cost-intro"><div><Sparkles size={16}/><span><strong>Solution options are the main workspace.</strong> Duplicate an option to model alternatives, then edit their catalog mappings and assumptions. Use Manage catalog for supporting pricing configuration.</span></div><span>{analysis.catalog.providers.length} providers · {analysis.catalog.skus.length} SKUs</span></div>
    <div className="tp-cost-options">
      {analysis.options.map((option) => {
        const result = computed.find((item) => item.option.id === option.id);
        return <section className="tp-cost-option" key={option.id}>
          <header><div><input aria-label={`${option.name} option name`} value={option.name} onChange={(event) => onRenameOption(option.id, event.target.value)}/><span>{result?.providerNames.join(' + ') || 'Unresolved provider'}</span></div><div className={result?.complete ? 'tp-cost-status complete' : 'tp-cost-status unresolved'}>{result?.complete ? <CheckCircle2 size={13}/> : <CircleAlert size={13}/>} {result?.complete ? 'Ready' : `${result?.issues.filter((item) => item.severity === 'error').length ?? 0} unresolved`}</div></header>
          <div className="tp-cost-mappings">
            {plan.spec.requirements.map((requirement) => {
              const currentLine = option.lines.find((line) => line.requirementId === requirement.id && line.kind === 'resource');
              const currentSku = analysis.catalog.skus.find((sku) => sku.id === currentLine?.skuId);
              const candidates = analysis.catalog.skus.filter((sku) => resourceById.get(sku.resourceId)?.category === CATEGORY[requirement.kind]);
              const monthly = result?.lines.filter((line) => line.line.requirementId === requirement.id).reduce((sum, line) => sum + (line.monthlyTotal ?? 0), 0) ?? 0;
              const ResourceIcon = requirement.kind === 'database' ? Database : Server;
              const requirementLines = option.lines.filter((line) => line.requirementId === requirement.id && line.kind === 'resource');
              const provider = providerById.get(resourceById.get(currentSku?.resourceId ?? '')?.providerId ?? '');
              return <div className="tp-cost-mapping" key={requirement.id}>
                <div className="tp-cost-mapping-summary"><span className="tp-cost-requirement"><ResourceIcon size={14}/><span><strong>{requirement.name}</strong><small>{requirement.kind} · {requirement.size}</small></span></span><select aria-label={`${option.name} ${requirement.name} catalog item`} value={currentSku?.id ?? ''} onChange={(event) => onSkuChange(option.id, requirement.id, event.target.value)}><option value="">Unresolved</option>{candidates.map((sku) => { const resource = resourceById.get(sku.resourceId); const skuProvider = providerById.get(resource?.providerId ?? ''); return <option key={sku.id} value={sku.id}>{skuProvider?.name} · {resource?.name} · {sku.name}</option>; })}</select><span className="tp-cost-line-total">{money(monthly, result?.currency ?? analysis.catalog.displayCurrency)}</span></div>
                <details><summary>Edit assumptions</summary><div className="tp-cost-line-assumptions">{requirementLines.map((line) => { const environment = Object.keys(line.quantities ?? {})[0] ?? option.environments[0] ?? 'default'; const quantity = line.quantities?.[environment] ?? 0; return <div key={line.id}><strong>{environment}</strong><label><span>Pricing</span><select aria-label={`${option.name} ${requirement.name} ${environment} pricing model`} value={line.pricingModelId ?? ''} onChange={(event) => onLineChange(option.id, line.id, { pricingModelId: event.target.value })}><option value="">Unresolved</option>{analysis.catalog.pricingModels.filter((model) => !model.providerId || model.providerId === provider?.id).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label><span>Schedule</span><select aria-label={`${option.name} ${requirement.name} ${environment} schedule`} value={line.scheduleId ?? ''} onChange={(event) => onLineChange(option.id, line.id, { scheduleId: event.target.value })}><option value="">Unresolved</option>{analysis.catalog.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}</select></label><label><span>Region</span><select aria-label={`${option.name} ${requirement.name} ${environment} region`} value={line.region ?? ''} onChange={(event) => onLineChange(option.id, line.id, { region: event.target.value })}><option value="">Default</option>{(provider?.regions ?? []).map((region) => <option key={region} value={region}>{region}</option>)}</select></label><label><span>Quantity</span><input aria-label={`${option.name} ${requirement.name} ${environment} quantity`} type="number" min="0" step="1" value={quantity} onChange={(event) => onLineChange(option.id, line.id, { quantities: { [environment]: Number(event.target.value) } })}/></label></div>; })}</div></details>
              </div>;
            })}
          </div>
          <footer><button type="button" className="secondary" onClick={() => onDuplicateOption(option.id)}><CopyPlus size={13}/> Duplicate option</button><span><small>Monthly estimate</small><strong>{money(result?.monthlyTotal ?? 0, result?.currency ?? analysis.catalog.displayCurrency)}</strong></span></footer>
        </section>;
      })}
    </div></>}
    <footer className="tp-plan-footer"><p>Draft and stale catalog rates remain visibly flagged; unresolved references cannot be selected.</p>{onContinue ? <button type="button" disabled={!computed.some((item) => item.complete)} onClick={onContinue}>Compare solution options →</button> : null}</footer>
  </div>;
}
