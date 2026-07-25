// The Drift view's side-panel list content: every drift class with its
// count and item rows, plus the `workspec-topology reconcile` CI affordance
// — ported from the design's drift panel. Purely presentational over
// `drift-panel-data.ts`'s `DriftClassGroup[]`; shown whenever nothing is
// selected (see `drift-side-panel.tsx`).

import type { ReactElement } from 'react';
import type { DriftSummary } from '@workspec/topology-recon';
import { DriftGlyph } from './drift-glyph.js';
import { DRIFT_META, driftColorVar } from './drift-meta.js';
import type { DriftClassGroup } from './drift-panel-data.js';

/** Props for {@link DriftPanel}. */
export interface DriftPanelProps {
  groups: readonly DriftClassGroup[];
  summary: DriftSummary;
  onSelect: (slug: string) => void;
}

export function DriftPanel(props: DriftPanelProps): ReactElement {
  const { groups, summary, onSelect } = props;

  return (
    <div className="tp-panel-body">
      <div className="tp-panel-intro">
        <span className="tp-panel-eyebrow">Drift · intended vs actual</span>
        <p className="tp-panel-copy">
          Reconciled from the environment&apos;s actual deployed state. Shape and pattern carry the
          class, not hue alone.
        </p>
      </div>

      <div className="tp-drift-groups">
        {groups.map((group) => {
          const meta = DRIFT_META[group.cls];
          return (
            <div key={group.cls} className="tp-drift-group">
              <div className="tp-drift-group-header">
                <span className="tp-drift-chip" style={{ color: driftColorVar(group.cls) }}>
                  <DriftGlyph drift={group.cls} size={13} />
                  {meta.label}
                </span>
                <span className="tp-drift-group-meaning">{meta.meaning}</span>
                <span className="tp-panel-spacer" />
                <span className="tp-drift-group-count" style={{ color: driftColorVar(group.cls) }}>
                  {group.count}
                </span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="tp-drift-item"
                  onClick={() => (item.targetSlug !== null ? onSelect(item.targetSlug) : undefined)}
                  disabled={item.targetSlug === null}
                >
                  <span className="tp-drift-item-name">{item.label}</span>
                  <span className="tp-panel-spacer" />
                  <span className="tp-drift-item-hint">{item.hint}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="tp-drift-ci">
        <span className="tp-drift-ci-command">$ workspec-topology reconcile</span>
        <span className="tp-panel-spacer" />
        <span className="tp-drift-ci-status">{summary.hasDrift ? 'CI exit 1' : 'CI exit 0'}</span>
      </div>
    </div>
  );
}
