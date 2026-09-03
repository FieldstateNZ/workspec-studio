import type { ReactElement, ReactNode } from 'react';
import type { CloudProvider, ProviderOption } from '@workspec/topology-planning';
import { Check, Cloud } from 'lucide-react';

export interface ProviderComparisonProps {
  options: readonly ProviderOption[];
  notice?: ReactNode;
  selected?: CloudProvider;
  onSelect: (provider: CloudProvider) => void;
  onContinue?: () => void;
}

function money(amount: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount); }

export function ProviderComparison({ options, notice, selected, onSelect, onContinue }: ProviderComparisonProps): ReactElement {
  const requirements = options[0]?.lines ?? [];
  return (
    <div className="tp-compare">
      <header className="tp-plan-header"><div><span>03 · Compare</span><h1>Compare cloud providers</h1><p>The same requirements, mapped and priced across Azure and AWS.</p></div><small>Estimate · prices captured {options[0]?.asOf}</small></header>
      {notice}
      <div className="tp-compare-grid">
        <div className="tp-compare-requirements"><div className="tp-compare-title">Requirement</div>{requirements.map((line) => <div className="tp-compare-row" key={line.requirementId}><strong>{line.requirementName}</strong><span>{line.requirementId}</span></div>)}<div className="tp-compare-total-label">Estimated monthly total</div></div>
        {options.map((option) => <section className={`tp-provider${selected === option.provider ? ' tp-provider-selected' : ''}`} key={option.provider}>
          <button type="button" className="tp-provider-head" onClick={() => onSelect(option.provider)} aria-pressed={selected === option.provider}>
            <span className="tp-provider-logo"><Cloud size={18}/></span><span><strong>{option.name}</strong><small>{option.currency} · monthly</small></span>{selected === option.provider ? <Check size={17}/> : <span className="tp-provider-radio"/>}
          </button>
          {option.lines.map((line) => <div className="tp-compare-row" key={line.requirementId}><strong>{line.service}</strong><span>{line.sku} · {money(line.monthlyTotal)}</span></div>)}
          <div className="tp-provider-total"><strong>{money(option.monthlyTotal)}</strong><span>{Object.entries(option.monthlyByEnvironment).map(([env, amount]) => `${env} ${money(amount)}`).join(' · ')}</span></div>
        </section>)}
      </div>
      <footer className="tp-plan-footer"><p>Estimates are deterministic planning inputs, not live provider quotes.</p>{onContinue ? <button type="button" disabled={!selected} onClick={onContinue}>Record decision →</button> : null}</footer>
    </div>
  );
}
