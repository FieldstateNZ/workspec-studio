import type { ReactElement, ReactNode } from 'react';
import type { InfrastructurePlan, InfrastructureRequirement, RequirementSize } from '@workspec/topology-planning';
import { Database, MessageSquare, Server, Sparkles } from 'lucide-react';

export interface InfrastructurePlanEditorProps {
  plan: InfrastructurePlan;
  notice?: ReactNode;
  onChange: (id: string, patch: Partial<Pick<InfrastructureRequirement, 'name' | 'size' | 'quantity' | 'availability' | 'notes'>>) => void;
  onContinue?: () => void;
}

const ICON = { compute: Server, database: Database, messaging: MessageSquare } as const;

export function InfrastructurePlanEditor({ plan, notice, onChange, onContinue }: InfrastructurePlanEditorProps): ReactElement {
  return (
    <div className="tp-plan">
      <header className="tp-plan-header">
        <div><span>02 · Infrastructure</span><h1>Infrastructure shopping list</h1><p>Provider-neutral requirements derived from deployable C4 elements.</p></div>
        <div className="tp-plan-summary"><strong>{plan.spec.requirements.length}</strong><span>requirements</span></div>
      </header>
      {notice}
      <div className="tp-plan-table-wrap">
        <table className="tp-plan-table">
          <thead><tr><th>Requirement</th><th>Capability</th><th>Size</th><th>Qty</th><th>Availability</th><th>Realizes</th></tr></thead>
          <tbody>{plan.spec.requirements.map((item) => {
            const Icon = ICON[item.kind as keyof typeof ICON] ?? Sparkles;
            return <tr key={item.id}>
              <td><div className="tp-plan-name"><Icon size={16}/><input aria-label={`${item.name} name`} value={item.name} onChange={(event) => onChange(item.id, { name: event.target.value })}/></div></td>
              <td><span className={`tp-plan-kind tp-plan-kind-${item.kind}`}>{item.kind}</span></td>
              <td><select aria-label={`${item.name} size`} value={item.size} onChange={(event) => onChange(item.id, { size: event.target.value as RequirementSize })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></td>
              <td><input className="tp-plan-qty" type="number" min={1} aria-label={`${item.name} quantity`} value={item.quantity} onChange={(event) => onChange(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}/></td>
              <td><select aria-label={`${item.name} availability`} value={item.availability} onChange={(event) => onChange(item.id, { availability: event.target.value as 'standard' | 'high' })}><option value="standard">Standard</option><option value="high">High</option></select></td>
              <td><span className="tp-plan-realizes">{item.realizes.join(', ')}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="tp-plan-footer"><p>Actors and external systems are intentionally excluded from deployment.</p>{onContinue ? <button type="button" onClick={onContinue}>Compare providers →</button> : null}</footer>
    </div>
  );
}
