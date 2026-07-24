// The side panel's node detail view: kind, resource group, network, slug,
// merged config, `realizes` c4-container chips, provider, and a computed
// one-line summary — ported from the design's detail markup. A back control
// returns to the resource list.
//
// One field the design showed has NO schema equivalent: its fixture data
// carried a hand-written `blurb` per resource (flavour text, not part of
// `ResourceSpec`). Rather than omit the copy entirely, a generic
// kind/type one-liner stands in — see `summaryFor` below (judgment call,
// documented in this package's implementation report).

import type { ReactElement } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ResolvedResource, ResolvedTopology } from '@workspec/topology-model';
import type { Drift } from '@workspec/topology-recon';
import { useLinkResolver } from './context.js';
import { DriftGlyph } from './drift-glyph.js';
import { DRIFT_META, driftColorVar } from './drift-meta.js';
import { Glyph } from './glyph.js';
import { kindColorVar, kindDisplayName } from './kind-meta.js';
import { ModeIcon } from './mode-icon.js';

/** This node's priced cost (P6) — display-ready, so `NodeDetail` never needs `@workspec/topology-cost`'s own `NodeCost` shape or a catalog reference directly. Built by `cost-side-panel.tsx` from a `useCost` result. */
export interface NodeDetailCost {
  /** Formatted monthly amount, e.g. `"$1,470"`. */
  readonly monthly: string;
  /** The bound catalog sku id. */
  readonly sku: string;
  /** Whether this resource bills flat (committed/reserved) vs pay-as-you-go (schedulable). */
  readonly committed: boolean;
}

/** Props for {@link NodeDetail}. */
export interface NodeDetailProps {
  resolved: ResolvedTopology;
  slug: string;
  onBack: () => void;
  /** P5 extension point (Drift view) — this node's own drift entry, if any. Omit for no drift box. */
  drift?: Drift;
  /** P6 extension point (Cost view) — this node's priced cost, if any. Omit for no cost box. */
  cost?: NodeDetailCost;
}

function summaryFor(resource: ResolvedResource): string {
  return `A ${kindDisplayName(resource.kind).toLowerCase()} resource (${resource.type}).`;
}

function formatConfigValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function MetaRow(props: { label: string; value: string }): ReactElement {
  return (
    <div className="tp-detail-meta-row">
      <span className="tp-detail-meta-key">{props.label}</span>
      <span className="tp-detail-meta-value">{props.value}</span>
    </div>
  );
}

/**
 * The per-node drift box's differing-keys list: for `divergent`, every
 * `configDiff`/`costDiff` entry as `key: authored → actual`; for
 * `miswired`, every edge this node's cluster reports, with its `side`
 * (spec §4: "declared but not observed" / "observed but not declared").
 * `phantom`/`orphan` carry no per-key detail beyond `drift.message` — the
 * drift itself IS the entire signal for those two classes.
 */
function DriftDiffRows(props: { drift: Drift }): ReactElement | null {
  const { drift } = props;
  if (drift.class === 'divergent') {
    const rows = [
      ...drift.configDiff.map((d) => ({ key: `config.${d.key}`, authored: d.authored, actual: d.actual })),
      ...drift.costDiff.map((d) => ({ key: `cost.${d.key}`, authored: d.authored, actual: d.actual })),
    ];
    return (
      <>
        {rows.map((row) => (
          <MetaRow
            key={row.key}
            label={row.key}
            value={`${formatConfigValue(row.authored)} → ${formatConfigValue(row.actual)}`}
          />
        ))}
      </>
    );
  }
  if (drift.class === 'miswired') {
    return (
      <>
        {drift.edges.map((edge) => (
          <MetaRow
            key={`${edge.side}:${edge.from}>${edge.to}`}
            label={edge.side === 'authored-only' ? 'declared' : 'observed'}
            value={`${edge.from} → ${edge.to}`}
          />
        ))}
      </>
    );
  }
  return null;
}

/** The P5 drift box: class glyph + label, the recon-authored `message`, and (for `divergent`/`miswired`) the differing keys/edges. */
function DriftBox(props: { drift: Drift }): ReactElement {
  const { drift } = props;
  const meta = DRIFT_META[drift.class];
  return (
    <div className="tp-drift-box">
      <div className="tp-drift-box-header">
        <span style={{ color: driftColorVar(drift.class) }}>
          <DriftGlyph drift={drift.class} size={15} />
        </span>
        <span className="tp-drift-box-label" style={{ color: driftColorVar(drift.class) }}>
          {meta.label}
        </span>
      </div>
      <p className="tp-drift-box-note">{drift.message}</p>
      <DriftDiffRows drift={drift} />
    </div>
  );
}

/** The P6 cost box: mode icon + label, and the priced monthly amount. */
function CostBox(props: { cost: NodeDetailCost }): ReactElement {
  const { cost } = props;
  return (
    <div className="tp-cost-box">
      <div className="tp-cost-box-header">
        <span className={cost.committed ? 'tp-cost-box-mode' : 'tp-cost-box-mode tp-cost-box-mode-schedulable'}>
          <ModeIcon committed={cost.committed} size={12} />
        </span>
        <span className="tp-cost-box-mode-label">
          {cost.committed ? 'committed · reservable' : 'schedulable · pay-as-you-go'}
        </span>
        <span className="tp-panel-spacer" />
        <span className="tp-cost-box-amount">{cost.monthly}</span>
        <span className="tp-cost-box-unit">/mo</span>
      </div>
      <MetaRow label="sku" value={cost.sku} />
    </div>
  );
}

export function NodeDetail(props: NodeDetailProps): ReactElement {
  const { resolved, slug, onBack, drift, cost } = props;
  const resolveLink = useLinkResolver();
  const resource = resolved.resources.find((r) => r.slug === slug);

  if (!resource) {
    return (
      <div className="tp-panel-body">
        <p className="tp-notice">This resource is no longer in the resolved topology.</p>
        <button type="button" className="tp-back-button" onClick={onBack}>
          <ArrowLeft size={13} /> Resources
        </button>
      </div>
    );
  }

  const nameBySlug = new Map(resolved.resources.map((r) => [r.slug, r.name]));
  const network = resource.network !== null ? (nameBySlug.get(resource.network) ?? resource.network) : '— (external)';
  const resourceGroup =
    resource.resourceGroup !== null
      ? (resolved.resourceGroupNames.get(resource.resourceGroup) ?? nameBySlug.get(resource.resourceGroup) ?? resource.resourceGroup)
      : '—';
  const accent = kindColorVar(resource.kind);
  const configEntries = resource.config !== null ? Object.entries(resource.config) : [];

  return (
    <div className="tp-panel-body">
      <div className="tp-detail-header">
        <button type="button" className="tp-back-button" onClick={onBack}>
          <ArrowLeft size={13} /> Resources
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

      <p className="tp-detail-summary">{summaryFor(resource)}</p>

      {drift !== undefined && <DriftBox drift={drift} />}

      <div className="tp-detail-section">
        <span className="tp-panel-eyebrow">resource</span>
        <MetaRow label="kind" value={kindDisplayName(resource.kind)} />
        <MetaRow label="resource group" value={resourceGroup} />
        <MetaRow label="network" value={network} />
        <MetaRow label="slug" value={resource.slug} />
      </div>

      {configEntries.length > 0 && (
        <div className="tp-detail-section">
          <span className="tp-panel-eyebrow">config</span>
          {configEntries.map(([key, value]) => (
            <MetaRow key={key} label={key} value={formatConfigValue(value)} />
          ))}
        </div>
      )}

      {resource.realizes.length > 0 && (
        <div className="tp-detail-section">
          <span className="tp-panel-eyebrow">realizes · c4 containers</span>
          <div className="tp-chip-row">
            {resource.realizes.map((containerSlug) => {
              const resolution = resolveLink({
                kind: 'c4-container',
                label: containerSlug,
                target: containerSlug,
              });
              const chipClassName = resolution.resolved ? 'tp-chip tp-chip-active' : 'tp-chip';
              return (
                <button
                  key={containerSlug}
                  type="button"
                  className={chipClassName}
                  disabled={!resolution.resolved}
                  title={resolution.resolved ? resolution.title : undefined}
                  onClick={resolution.resolved ? resolution.onClick : undefined}
                >
                  {`↳ ${containerSlug}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cost !== undefined && <CostBox cost={cost} />}
    </div>
  );
}
