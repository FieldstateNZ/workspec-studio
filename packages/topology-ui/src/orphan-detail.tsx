// The Drift view's detail for an ORPHAN (actual-only) resource — deliberately
// a separate, lighter component from `NodeDetail` rather than an extension
// of it: an orphan has no `ResolvedResource` at all (it exists only in the
// `DerivedTopology`, shaped very differently — no `network`/`resourceGroup`
// slugs to resolve, no `realizes`, no merged authored `config`), so bolting
// it onto `NodeDetail`'s authored-topology-shaped rendering would mean two
// incompatible code paths behind one component instead of two small, honest
// ones (judgment call — see this package's implementation report).

import type { ReactElement } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DerivedResource, Drift } from '@workspec/topology-recon';
import { DriftGlyph } from './drift-glyph.js';
import { DRIFT_META, driftColorVar } from './drift-meta.js';
import { Glyph } from './glyph.js';
import { kindColorVar, kindDisplayName } from './kind-meta.js';

/** Props for {@link OrphanDetail}. */
export interface OrphanDetailProps {
  resource: DerivedResource;
  /** The `orphan`-class `Drift` for this resource, if `reconcile()` reported one (it always should — an orphan detail is only ever reached via an orphan drift item — but this stays optional rather than assumed). */
  drift?: Drift;
  onBack: () => void;
}

export function OrphanDetail(props: OrphanDetailProps): ReactElement {
  const { resource, drift, onBack } = props;
  const accent = kindColorVar(resource.kind);

  return (
    <div className="tp-panel-body">
      <div className="tp-detail-header">
        <button type="button" className="tp-back-button" onClick={onBack}>
          <ArrowLeft size={13} /> Drift
        </button>
        <span className="tp-panel-spacer" />
        <span className="tp-provider-pill">{resource.provider.toUpperCase()}</span>
      </div>

      <div className="tp-detail-identity">
        <span
          className="tp-detail-icon"
          style={{ color: accent, background: `color-mix(in oklab, ${accent} 15%, transparent)` }}
        >
          <Glyph kind={resource.kind} size={24} />
        </span>
        <span className="tp-detail-identity-text">
          <span className="tp-detail-name">{resource.name}</span>
          <span className="tp-detail-type">{resource.type}</span>
        </span>
      </div>

      {drift !== undefined && (
        <div className="tp-drift-box">
          <div className="tp-drift-box-header">
            <span style={{ color: driftColorVar('orphan') }}>
              <DriftGlyph drift="orphan" size={15} />
            </span>
            <span className="tp-drift-box-label" style={{ color: driftColorVar('orphan') }}>
              {DRIFT_META.orphan.label}
            </span>
          </div>
          <p className="tp-drift-box-note">{drift.message}</p>
        </div>
      )}

      <div className="tp-detail-section">
        <span className="tp-panel-eyebrow">resource</span>
        <div className="tp-detail-meta-row">
          <span className="tp-detail-meta-key">kind</span>
          <span className="tp-detail-meta-value">{kindDisplayName(resource.kind)}</span>
        </div>
        <div className="tp-detail-meta-row">
          <span className="tp-detail-meta-key">slug</span>
          <span className="tp-detail-meta-value">{resource.slug}</span>
        </div>
      </div>

      <div className="tp-detail-section">
        <span className="tp-panel-eyebrow">{`source · ${resource.source?.kind ?? 'derived'}`}</span>
        <span className="tp-detail-meta-value">{resource.source?.from ?? '—'}</span>
      </div>
    </div>
  );
}
