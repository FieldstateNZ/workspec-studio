import type { ReactElement } from 'react';
import type { CostAnalysisModel, CostedOption } from '@workspec/topology-planning';
import { Check, Layers3, TriangleAlert } from 'lucide-react';

export interface SolutionComparisonProps {
  analysis: CostAnalysisModel;
  options: readonly CostedOption[];
  selected?: string;
  onSelect: (optionId: string) => void;
  onContinue?: () => void;
}
export type ProviderComparisonProps = SolutionComparisonProps;

function money(amount: number, currency: string): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }

export function SolutionComparison({ analysis, options, selected, onSelect, onContinue }: SolutionComparisonProps): ReactElement {
  const requirements = [...new Map(options.flatMap((option) => option.lines.map((line) => [line.line.requirementId, line.line.label.replace(/ · (dev|prod)$/, '')] as const))).entries()];
  const resourceById = new Map(analysis.catalog.resources.map((item) => [item.id, item]));
  const skuById = new Map(analysis.catalog.skus.map((item) => [item.id, item]));
  const selectedReady = options.find((option) => option.option.id === selected)?.complete ?? false;
  return <div className="tp-compare">
    <header className="tp-plan-header"><div><span>04 · Compare</span><h1>Compare solution options</h1><p>The same requirements, costed across candidate deployment approaches.</p></div><small>Catalog captured {analysis.catalog.asOf}</small></header>
    <div className="tp-compare-grid" style={{ gridTemplateColumns: `minmax(190px,.75fr) repeat(${Math.max(1, options.length)},minmax(260px,1fr))` }}>
      <div className="tp-compare-requirements"><div className="tp-compare-title">Requirement</div>{requirements.map(([id, name]) => <div className="tp-compare-row" key={id}><strong>{name}</strong><span>{id}</span></div>)}<div className="tp-compare-total-label">Estimated monthly total</div></div>
      {options.map((result) => <section className={`tp-provider${selected === result.option.id ? ' tp-provider-selected' : ''}`} key={result.option.id}>
        <button type="button" className="tp-provider-head" disabled={!result.complete} onClick={() => onSelect(result.option.id)} aria-pressed={selected === result.option.id}>
          <span className="tp-provider-logo">{result.complete ? <Layers3 size={18}/> : <TriangleAlert size={18}/>}</span><span><strong>{result.option.name}</strong><small>{result.providerNames.join(' + ') || 'Unresolved catalog'} · {result.currency}</small></span>{selected === result.option.id ? <Check size={17}/> : <span className="tp-provider-radio"/>}
        </button>
        {requirements.map(([requirementId]) => {
          const rows = result.lines.filter((line) => line.line.requirementId === requirementId);
          const firstSku = skuById.get(rows.find((row) => row.line.skuId)?.line.skuId ?? '');
          const resource = resourceById.get(firstSku?.resourceId ?? '');
          const amount = rows.reduce((sum, row) => sum + (row.monthlyTotal ?? 0), 0);
          const unresolved = rows.some((row) => row.monthlyTotal === null);
          return <div className="tp-compare-row" key={requirementId}><strong>{unresolved ? 'Unresolved' : resource?.name ?? firstSku?.name ?? 'Catalog item'}</strong><span>{firstSku?.name ?? 'Select a SKU'} · {unresolved ? '—' : money(amount, result.currency)}</span></div>;
        })}
        <div className="tp-provider-total"><strong>{result.complete ? money(result.monthlyTotal, result.currency) : 'Incomplete'}</strong><span>{result.complete ? Object.entries(result.monthlyByEnvironment).map(([env, amount]) => `${env} ${money(amount, result.currency)}`).join(' · ') : `${result.issues.filter((issue) => issue.severity === 'error').length} unresolved catalog references`}</span></div>
      </section>)}
    </div>
    <footer className="tp-plan-footer"><p>Options may share a provider or combine providers; catalog provenance stays attached to every rate.</p>{onContinue ? <button type="button" disabled={!selectedReady} onClick={onContinue}>Record decision →</button> : null}</footer>
  </div>;
}

/** @deprecated Use SolutionComparison. */
export const ProviderComparison = SolutionComparison;
