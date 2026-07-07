// One option card: a collapsed header (archetype, name, tag, summary, two mini
// criteria, per-env + annual cost, cheapest / recommended badges) that expands
// to reveal the live cost editor. Faithful to the prototype `OptionCard`. All
// numbers come from the engine's `OptionCost`; nothing is computed here.

import type { CSSProperties, ReactElement } from 'react';
import type { OptionCost } from '@workspec/decision-engine';
import type { Catalog, Criterion, Decision, Option } from '@workspec/decision-schema';
import { CostEditor } from './cost-editor.js';
import type { CostEditorCallbacks } from './cost-editor.js';
import { money } from './format.js';
import { Dots, Flag, Icon, optAccent } from './primitives.js';

export interface OptionCardProps extends CostEditorCallbacks {
  option: Option;
  decision: Decision;
  catalog: Catalog;
  criteria: Criterion[];
  cost: OptionCost;
  open: boolean;
  onToggle: () => void;
  cheapest: boolean;
  recommended: boolean;
}

export function OptionCard(props: OptionCardProps): ReactElement {
  const { option, cost, criteria, cheapest, recommended } = props;
  const complete = cost.complete;
  const miniCriteria = criteria.slice(0, 2);

  const cls = ['ds-opt'];
  if (props.open) cls.push('ds-opt-open');
  if (!complete) cls.push('ds-opt-incomplete');

  const accentStyle = { '--ds-opt-accent': optAccent(option.id) } as CSSProperties;

  return (
    <div className={cls.join(' ')} style={accentStyle}>
      <button
        type="button"
        className="ds-opt-head"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span className="ds-opt-id">
          <span className="ds-chev" aria-hidden="true">
            <Icon.chevron />
          </span>
          <span className="ds-opt-titleblock">
            {option.archetype !== undefined && (
              <span className="ds-opt-arch">{option.archetype}</span>
            )}
            <span className="ds-opt-title">
              {option.name}
              {option.tag !== undefined && <span className="ds-chip">{option.tag}</span>}
              {!complete && <Flag tone="warn">Modelling</Flag>}
            </span>
            {option.summary !== undefined && <span className="ds-opt-sum">{option.summary}</span>}
            <span className="ds-minicrit">
              {miniCriteria.map((c) => {
                const score = option.scores[c.id]?.score ?? 0;
                return (
                  <span className="ds-mc" key={c.id}>
                    <span className="ds-mc-lab">{c.label}</span>
                    <Dots value={score} />
                  </span>
                );
              })}
              {cheapest && (
                <Flag tone="accent">
                  <Icon.check className="ds-flag-icon" /> Cheapest
                </Flag>
              )}
              {recommended && (
                <Flag tone="agent">
                  <Icon.spark className="ds-flag-icon" /> Recommended
                </Flag>
              )}
            </span>
          </span>
        </span>

        <span className="ds-opt-costblock">
          <span className="ds-opt-cost">
            {cost.activeEnvs.map((e) => (
              <span className="ds-env" key={e}>
                <span className="ds-k">{e}</span>
                <span className="ds-v ds-tnum">{money(cost.perEnv[e], complete)}</span>
                <span className="ds-per">/mo</span>
              </span>
            ))}
          </span>
          <span className="ds-opt-annual">
            <span className="ds-k">Annual</span>
            <span className="ds-v ds-tnum">{money(cost.annual, complete)}</span>
            {cheapest && complete ? (
              <span className="ds-hr">cheapest</span>
            ) : cost.headroom > 0 && complete ? (
              <span className="ds-hr">↓{money(cost.headroom)}/mo avail</span>
            ) : null}
          </span>
        </span>
      </button>

      {props.open && (
        <CostEditor
          option={option}
          decision={props.decision}
          catalog={props.catalog}
          criteria={criteria}
          cost={cost}
          onToggleLever={props.onToggleLever}
          onLineField={props.onLineField}
          onLineQty={props.onLineQty}
          onLineAmount={props.onLineAmount}
          onToggleEnv={props.onToggleEnv}
          onScore={props.onScore}
        />
      )}
    </div>
  );
}
