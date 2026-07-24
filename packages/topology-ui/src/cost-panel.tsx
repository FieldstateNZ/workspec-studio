// The Cost view's side-panel list content: per-node cost rows (mode icon +
// amount), the intended/committed/schedulable totals, the reservable vs
// schedulable split cards, and the `realizes` c4-container attribution
// breakdown — ported from the design's cost panel. Purely presentational
// over `cost-panel-data.ts`'s `CostPanelData`; shown whenever nothing is
// selected (see `cost-side-panel.tsx`).

import type { ReactElement } from 'react';
import { ModeIcon } from './mode-icon.js';
import type { CostPanelData } from './cost-panel-data.js';

/** Props for {@link CostPanel}. */
export interface CostPanelProps {
  data: CostPanelData;
  onSelect: (slug: string) => void;
}

export function CostPanel(props: CostPanelProps): ReactElement {
  const { data, onSelect } = props;

  return (
    <div className="tp-panel-body">
      <div className="tp-panel-intro">
        <span className="tp-panel-eyebrow">Cost</span>
        <p className="tp-panel-copy">
          Priced by the same normative engine as Decision Studio. Attribution rolls up boundary →
          environment, and through <code>realizes</code> to c4 containers.
        </p>
      </div>

      <div className="tp-cost-rows">
        {data.rows.map((row) => (
          <button key={row.slug} type="button" className="tp-cost-row" onClick={() => onSelect(row.slug)}>
            <span
              className={row.idles ? 'tp-cost-row-mode tp-cost-row-mode-schedulable' : 'tp-cost-row-mode'}
            >
              <ModeIcon committed={row.committed} />
            </span>
            <span className="tp-cost-row-name">{row.name}</span>
            {row.idles && <span className="tp-cost-row-tag">idles</span>}
            <span className="tp-panel-spacer" />
            <span className="tp-cost-row-amount">{row.formattedMonthly}</span>
          </button>
        ))}
      </div>

      <div className="tp-cost-totals">
        <div className="tp-cost-total-row">
          <span className="tp-cost-total-label">total</span>
          <span className="tp-panel-spacer" />
          <span className="tp-cost-total-value">{data.totalFormatted}</span>
        </div>
      </div>

      <div className="tp-cost-split">
        <div className="tp-cost-split-card">
          <span className="tp-cost-split-label">
            <ModeIcon committed size={11} />
            reservable
          </span>
          <span className="tp-cost-split-value">{data.committedFormatted}</span>
        </div>
        <div className="tp-cost-split-card">
          <span className="tp-cost-split-label">
            <ModeIcon committed={false} size={11} />
            schedulable
          </span>
          <span className="tp-cost-split-value">{data.schedulableFormatted}</span>
        </div>
      </div>

      {data.attribution.length > 0 && (
        <div className="tp-cost-attribution">
          <span className="tp-panel-eyebrow">attribution · c4 containers</span>
          {data.attribution.map((row) => (
            <div key={row.container} className="tp-cost-attribution-row">
              <span className="tp-cost-attribution-name">
                {row.container}
                {row.unattributedByDefault ? ' *' : ''}
              </span>
              <span className="tp-panel-spacer" />
              <span className="tp-cost-attribution-value">{row.formattedMonthly}</span>
            </div>
          ))}
          <div className="tp-cost-attribution-row">
            <span className="tp-cost-attribution-name">unattributed</span>
            <span className="tp-panel-spacer" />
            <span className="tp-cost-attribution-value">{data.unattributedFormatted}</span>
          </div>
        </div>
      )}
    </div>
  );
}
