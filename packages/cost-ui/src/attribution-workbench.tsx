// The Attribution Workbench — variant 2a ("Unified workbench") of the design
// handoff: one surface, three verbs. The rule rail authors rules (toggle is
// an ephemeral, no-write recompute; reorder/promote/remove persist through
// `useWriteAttribution`); clicking a resource row opens its cascade inline;
// the coverage bar's "Fix coverage →" opens triage, whose composer promotes
// an unattributed cluster into a first-class rail rule. See the C5a report
// for the fidelity deviations from the dossier (precedence is hardcoded to
// first-match-wins — cost-engine has no last-match mode to back a toggle).

import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Attribution, Ref, RuleType } from '@workspec/cost-schema';
import { attribute } from '@workspec/cost-engine';
import type { AttributeResult, ResourceResolution } from '@workspec/cost-engine';
import { useCapabilities, useCostArtifacts, useWriteAttribution } from './context.js';
import { useControllableState } from './use-controllable-state.js';
import {
  assignChipsOf,
  buildPromotedRule,
  cascadeValueLabel,
  chipAccentFor,
  clampPercent,
  computeUnattributedClusters,
  filterEnabledRules,
  formatMoney,
  formatPercent,
  matchLineOf,
  nextRuleId,
  splitCellLabel,
} from './format.js';

/** The workbench's UI state — lifted by `CostApp` so Reports' stats and the rail agree. */
export interface AttributionWorkbenchState {
  /** Rule ids currently toggled off — ephemeral, never written back. */
  disabledRuleIds: string[];
  /** Rule ids promoted via the composer THIS session — the only ones the rail lets you ✕ remove. */
  sessionPromotedIds: string[];
  selectedResourceId: string | null;
  filter: 'all' | 'unattributed';
  /** The selected unattributed cluster (a resource group), when in triage mode. */
  cluster: string | null;
  /** The composer's chosen primary-dimension value for the active cluster. */
  draftValue: string | null;
}

export const DEFAULT_WORKBENCH_STATE: AttributionWorkbenchState = {
  disabledRuleIds: [],
  sessionPromotedIds: [],
  selectedResourceId: null,
  filter: 'all',
  cluster: null,
  draftValue: null,
};

const ROW_CAP = 12;

export interface AttributionWorkbenchProps {
  inventoryRef: Ref;
  attributionRef: Ref;
  /** Controlled workbench state, shared with `CostReport` by `CostApp`. Uncontrolled (internal `useState`) when omitted. */
  state?: AttributionWorkbenchState;
  onStateChange?: (state: AttributionWorkbenchState) => void;
}

function assignmentLabel(resolution: ResourceResolution, dimensionId: string): string {
  const assignment = resolution.assignments[dimensionId];
  return assignment ? cascadeValueLabel(assignment) : '';
}

interface CascadeLine {
  key: string;
  id: string;
  name: string;
  line: string;
  kind: 'won' | 'shadow' | 'neutral' | 'override';
}

function buildCascade(
  resolution: ResourceResolution,
  ruleById: ReadonlyMap<string, RuleType>,
): CascadeLine[] {
  const lines: CascadeLine[] = [];
  for (const entry of resolution.trace) {
    const rule = ruleById.get(entry.ruleId);
    if (!rule) continue;
    if (entry.tookDimensions.length > 0) {
      lines.push({
        key: entry.ruleId,
        id: entry.ruleId,
        name: rule.name,
        kind: 'won',
        line: `→ ${entry.tookDimensions.map((d) => `${d} = ${assignmentLabel(resolution, d)}`).join(' · ')}`,
      });
    } else if (entry.shadowed.length > 0) {
      lines.push({
        key: entry.ruleId,
        id: entry.ruleId,
        name: rule.name,
        kind: 'shadow',
        line: `matched — ${entry.shadowed.map((s) => `${s.dimensionId} shadowed by ${s.winnerRuleId}`).join(' · ')}`,
      });
    } else {
      lines.push({ key: entry.ruleId, id: entry.ruleId, name: rule.name, kind: 'neutral', line: 'matched — no effect' });
    }
  }
  if (resolution.overrideTrace) {
    const dims = resolution.overrideTrace.tookDimensions;
    lines.push({
      key: 'override',
      id: '⚲',
      name: 'pinned override',
      kind: 'override',
      line: `→ ${dims.map((d) => `${d} = ${assignmentLabel(resolution, d)}`).join(' · ')} (beats all rules)`,
    });
  }
  return lines;
}

export function AttributionWorkbench(props: AttributionWorkbenchProps): ReactElement {
  const { inventoryRef, attributionRef } = props;
  const { inventory, attribution, spends, isPending, isError, error } = useCostArtifacts(
    inventoryRef,
    attributionRef,
  );
  const capabilities = useCapabilities();
  const writeAttribution = useWriteAttribution();
  const [state, setState] = useControllableState(props.state, props.onStateChange, DEFAULT_WORKBENCH_STATE);

  const enabledRules = useMemo(
    () => (attribution ? filterEnabledRules(attribution.spec.rules, state.disabledRuleIds) : []),
    [attribution, state.disabledRuleIds],
  );

  const liveAttribution: Attribution | undefined = useMemo(
    () => (attribution ? { ...attribution, spec: { ...attribution.spec, rules: enabledRules } } : undefined),
    [attribution, enabledRules],
  );

  const result: AttributeResult | undefined = useMemo(
    () => (inventory && liveAttribution && spends ? attribute(inventory, spends, liveAttribution) : undefined),
    [inventory, liveAttribution, spends],
  );

  const ruleById = useMemo(
    () => new Map((attribution?.spec.rules ?? []).map((r) => [r.id, r])),
    [attribution],
  );

  const primaryDimension = attribution?.spec.dimensions[0];
  const primaryCoverage = result?.coverage.find((c) => c.isPrimary);

  const resourceGroupById = useMemo(
    () => new Map((inventory?.spec.resources ?? []).map((r) => [r.id, r.resourceGroup])),
    [inventory],
  );

  const clusters = useMemo(() => {
    if (!result || !primaryDimension) return [];
    return computeUnattributedClusters(
      result.resolutions,
      resourceGroupById,
      result.resourceSpend,
      primaryDimension.id,
    );
  }, [result, primaryDimension, resourceGroupById]);

  const draftRuleId = attribution ? nextRuleId(attribution.spec.rules) : 'r9';
  const draftValue =
    state.draftValue ?? (primaryDimension?.values.includes('shared') ? 'shared' : primaryDimension?.values[0]) ?? '';

  const draftProjection = useMemo(() => {
    if (!inventory || !liveAttribution || !spends || !primaryDimension || state.cluster === null) return undefined;
    const draftRule = buildPromotedRule(draftRuleId, state.cluster, primaryDimension.id, draftValue);
    const draftAttribution: Attribution = {
      ...liveAttribution,
      spec: { ...liveAttribution.spec, rules: [...liveAttribution.spec.rules, draftRule] },
    };
    const projected = attribute(inventory, spends, draftAttribution);
    const hits = inventory.spec.resources.filter((r) => r.resourceGroup === state.cluster);
    const hitSpend = hits.reduce((sum, r) => sum + (result?.resourceSpend[r.id] ?? 0), 0);
    const projectedCoverage = projected.coverage.find((c) => c.isPrimary);
    return {
      matchLine: `matches ${hits.length} · ${formatMoney(hitSpend)}/mo`,
      coveragePercent: projectedCoverage ? projectedCoverage.ratio * 100 : 0,
    };
  }, [inventory, liveAttribution, spends, primaryDimension, state.cluster, draftValue, draftRuleId, result]);

  const pool = useMemo(() => {
    if (!inventory || !result) return [];
    if (state.filter !== 'unattributed') return inventory.spec.resources;
    const primaryId = result.primaryDimensionId;
    const unattributedIds = new Set(
      result.resolutions.filter((r) => r.assignments[primaryId] === undefined).map((r) => r.resourceId),
    );
    const filtered = inventory.spec.resources.filter((r) => unattributedIds.has(r.id));
    return state.cluster === null ? filtered : filtered.filter((r) => r.resourceGroup === state.cluster);
  }, [inventory, result, state.filter, state.cluster]);

  const resolutionById = useMemo(
    () => new Map((result?.resolutions ?? []).map((r) => [r.resourceId, r])),
    [result],
  );

  const selectedResolution =
    state.selectedResourceId !== null ? resolutionById.get(state.selectedResourceId) : undefined;
  const selectedWinningRuleIds = new Set(
    selectedResolution
      ? selectedResolution.trace.filter((t) => t.tookDimensions.length > 0).map((t) => t.ruleId)
      : [],
  );

  function toggleRule(ruleId: string): void {
    setState((prev) => ({
      ...prev,
      disabledRuleIds: prev.disabledRuleIds.includes(ruleId)
        ? prev.disabledRuleIds.filter((id) => id !== ruleId)
        : [...prev.disabledRuleIds, ruleId],
    }));
  }

  function moveRule(index: number, direction: -1 | 1): void {
    if (!attribution) return;
    const rules = attribution.spec.rules;
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const a = rules[index];
    const b = rules[target];
    if (!a || !b) return;
    const next = rules.slice();
    next[index] = b;
    next[target] = a;
    writeAttribution.mutate({ ref: attributionRef, attribution: { ...attribution, spec: { ...attribution.spec, rules: next } } });
  }

  function removeRule(ruleId: string): void {
    if (!attribution) return;
    const next = attribution.spec.rules.filter((r) => r.id !== ruleId);
    writeAttribution.mutate(
      { ref: attributionRef, attribution: { ...attribution, spec: { ...attribution.spec, rules: next } } },
      {
        onSuccess: () => {
          setState((prev) => ({
            ...prev,
            sessionPromotedIds: prev.sessionPromotedIds.filter((id) => id !== ruleId),
            disabledRuleIds: prev.disabledRuleIds.filter((id) => id !== ruleId),
          }));
        },
      },
    );
  }

  function selectResource(resourceId: string): void {
    setState((prev) => ({
      ...prev,
      selectedResourceId: prev.selectedResourceId === resourceId ? null : resourceId,
    }));
  }

  function pickCluster(resourceGroup: string): void {
    setState((prev) => ({
      ...prev,
      cluster: prev.cluster === resourceGroup ? null : resourceGroup,
      draftValue: null,
    }));
  }

  function pickDraftValue(value: string): void {
    setState((prev) => ({ ...prev, draftValue: value }));
  }

  function addRule(): void {
    if (!attribution || !primaryDimension || state.cluster === null) return;
    const id = nextRuleId(attribution.spec.rules);
    const rule = buildPromotedRule(id, state.cluster, primaryDimension.id, draftValue);
    writeAttribution.mutate(
      {
        ref: attributionRef,
        attribution: { ...attribution, spec: { ...attribution.spec, rules: [...attribution.spec.rules, rule] } },
      },
      {
        onSuccess: () => {
          setState((prev) => ({
            ...prev,
            sessionPromotedIds: [...prev.sessionPromotedIds, id],
            cluster: null,
            draftValue: null,
          }));
        },
      },
    );
  }

  if (isPending) return <div className="cost-notice">Loading attribution workbench…</div>;
  if (isError) return <div className="cost-notice cost-notice-error">{`Could not load: ${error?.message ?? 'unknown error'}`}</div>;
  if (!inventory || !attribution || !result || !primaryDimension) {
    return <div className="cost-notice cost-notice-error">Attribution artifact not found.</div>;
  }

  const dims = attribution.spec.dimensions;
  const dimWidths = dims.length === 3 ? ['1.35fr', '0.85fr', '1fr'] : dims.map(() => '1fr');
  const gridTemplateColumns = `1.75fr 1.15fr 0.65fr ${dimWidths.join(' ')}`;
  const unattributedSpend = primaryCoverage?.unattributedSpend ?? 0;
  const showFix = state.filter !== 'unattributed' && unattributedSpend > 0.5;
  const rows = pool.slice(0, ROW_CAP);

  return (
    <div className="cost-workbench">
      <div className="cost-coverage-row">
        <span className="cost-coverage-label">Attribution coverage</span>
        <div className="cost-coverage-track">
          <div className="cost-coverage-fill" style={{ width: `${clampPercent(primaryCoverage?.ratio ?? 0)}%` }} />
        </div>
        <span className="cost-coverage-figure">{formatPercent((primaryCoverage?.ratio ?? 0) * 100)}</span>
        <span className="cost-coverage-unatt">{`${formatMoney(unattributedSpend)}/mo unattributed`}</span>
        <span className="cost-precedence-pill">first match wins</span>
        {showFix && (
          <button
            type="button"
            className="cost-btn-solid cost-fix-coverage-btn"
            onClick={() => setState((prev) => ({ ...prev, filter: 'unattributed', cluster: null }))}
          >
            Fix coverage →
          </button>
        )}
      </div>

      <div className="cost-workbench-grid">
        <div className="cost-rail">
          <div className="cost-rail-header">
            <span className="cost-rail-header-label">Rules</span>
            <span className="cost-rail-header-hairline" />
            <span className="cost-rail-header-note">top → bottom</span>
          </div>

          {attribution.spec.rules.map((rule, index) => {
            const on = !state.disabledRuleIds.includes(rule.id);
            const canRemove = capabilities.editAttribution && state.sessionPromotedIds.includes(rule.id);
            const winning = selectedWinningRuleIds.has(rule.id);
            const stats = result.ruleStats[rule.id] ?? { ruleId: rule.id, matched: 0, won: 0 };
            const chips = assignChipsOf(rule);
            return (
              <div
                key={rule.id}
                className={`cost-rule-row${winning ? ' cost-rule-row--winning' : ''}${on ? '' : ' cost-rule-row--off'}`}
              >
                <button
                  type="button"
                  aria-label={`Toggle rule ${rule.id}`}
                  aria-pressed={on}
                  className={`cost-rule-toggle${on ? ' cost-rule-toggle--on' : ''}`}
                  onClick={() => toggleRule(rule.id)}
                >
                  <span className="cost-rule-toggle-knob" />
                </button>
                <div className="cost-rule-body">
                  <div className="cost-rule-line1">
                    <span className="cost-rule-id">{rule.id}</span>
                    <span className="cost-rule-name">{rule.name}</span>
                    <span className="cost-rule-count">{`${stats.matched} match · ${stats.won} win`}</span>
                    {canRemove && (
                      <button
                        type="button"
                        className="cost-rule-remove"
                        aria-label={`Remove rule ${rule.id}`}
                        onClick={() => removeRule(rule.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="cost-rule-matchline">{matchLineOf(rule)}</span>
                  <div className="cost-rule-chips">
                    {chips.map((chip) => (
                      <span key={chip.key} className="cost-chip" style={{ '--chip-accent': chip.accent } as CSSProperties}>
                        {chip.text}
                      </span>
                    ))}
                  </div>
                </div>
                {capabilities.editAttribution && (
                  <div className="cost-rule-reorder">
                    <button
                      type="button"
                      className="cost-rule-reorder-btn"
                      aria-label={`Move rule ${rule.id} up`}
                      onClick={() => moveRule(index, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="cost-rule-reorder-btn"
                      aria-label={`Move rule ${rule.id} down`}
                      onClick={() => moveRule(index, 1)}
                    >
                      ▼
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="cost-rail-footer">
            <button
              type="button"
              className="cost-btn-dashed cost-new-rule-btn"
              disabled
              title="Rule authoring beyond cluster promotion isn't wired up yet — promote a cluster from Fix coverage, or edit the attribution artifact directly."
            >
              + New rule
            </button>
          </div>
        </div>

        <div className="cost-table-col">
          <div className="cost-filter-bar">
            <button
              type="button"
              className={`cost-filter-chip${state.filter === 'all' ? ' cost-filter-chip--active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, filter: 'all', cluster: null }))}
            >
              {`All · ${inventory.spec.resources.length}`}
            </button>
            <button
              type="button"
              className={`cost-filter-chip${state.filter === 'unattributed' ? ' cost-filter-chip--active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, filter: 'unattributed' }))}
            >
              {`Unattributed · ${primaryCoverage?.unattributedCount ?? 0}`}
            </button>
            <span className="cost-filter-hint">click a row for its cascade</span>
          </div>

          {state.filter === 'unattributed' && (
            <div className="cost-triage-band">
              <div className="cost-cluster-row">
                <span className="cost-cluster-label">clusters</span>
                {clusters.length > 0 &&
                  clusters.map((cluster) => (
                    <button
                      key={cluster.resourceGroup}
                      type="button"
                      className={`cost-cluster-chip${state.cluster === cluster.resourceGroup ? ' cost-cluster-chip--active' : ''}`}
                      onClick={() => pickCluster(cluster.resourceGroup)}
                    >
                      {`${cluster.resourceGroup} · ${cluster.count} · ${formatMoney(cluster.amount)}`}
                    </button>
                  ))}
                {clusters.length === 0 && (
                  <span className="cost-fully-attributed">fully attributed — commit *.attribution.yaml and run plan</span>
                )}
              </div>

              {state.cluster !== null && (
                <div className="cost-composer">
                  <span className="cost-composer-matcher">{`resourceGroup ~ ${state.cluster}`}</span>
                  <span className="cost-composer-arrow">{`→ ${primaryDimension.id} =`}</span>
                  <div className="cost-composer-pills">
                    {primaryDimension.values.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`cost-pill${draftValue === value ? ' cost-pill--active' : ''}`}
                        style={{ '--chip-accent': chipAccentFor(primaryDimension.id, value) } as CSSProperties}
                        onClick={() => pickDraftValue(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <span className="cost-composer-projection">
                    {draftProjection?.matchLine ?? ''}
                    {' · coverage '}
                    {formatPercent((primaryCoverage?.ratio ?? 0) * 100)}
                    {' → '}
                    <span className="cost-composer-projection-delta">
                      {formatPercent(draftProjection?.coveragePercent ?? 0)}
                    </span>
                  </span>
                  <button type="button" className="cost-btn-solid cost-add-rule-btn" onClick={addRule}>
                    {`Add as ${draftRuleId}`}
                  </button>
                  <button
                    type="button"
                    className="cost-cancel-btn"
                    aria-label="Cancel"
                    onClick={() => setState((prev) => ({ ...prev, cluster: null, draftValue: null }))}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="cost-table-header" style={{ gridTemplateColumns }}>
            <span className="cost-table-header-cell">Resource</span>
            <span className="cost-table-header-cell">Resource group</span>
            <span className="cost-table-header-cell cost-table-header-cell--right">$/mo</span>
            {dims.map((dim) => (
              <span key={dim.id} className="cost-table-header-cell">
                {dim.id}
              </span>
            ))}
          </div>

          {rows.map((resource) => {
            const resolution = resolutionById.get(resource.id);
            const open = state.selectedResourceId === resource.id;
            return (
              <div key={resource.id} className="cost-table-row-group">
                <div
                  className={`cost-table-row${open ? ' cost-table-row--selected' : ''}`}
                  style={{ gridTemplateColumns }}
                  onClick={() => selectResource(resource.id)}
                >
                  <span className="cost-table-cell-resource">
                    <span className="cost-table-cell-resource-name">{resource.name}</span>
                    <span className="cost-table-cell-resource-type">{resource.type}</span>
                  </span>
                  <span className="cost-table-cell-rg">{resource.resourceGroup}</span>
                  <span className="cost-table-cell-spend">{formatMoney(result.resourceSpend[resource.id] ?? 0)}</span>
                  {dims.map((dim) => {
                    const assignment = resolution?.assignments[dim.id];
                    if (!assignment) {
                      return (
                        <span key={dim.id} className="cost-table-cell-dim">
                          <span className="cost-chip cost-chip--none">—</span>
                        </span>
                      );
                    }
                    const text = assignment.kind === 'split' ? splitCellLabel(assignment.parts) : assignment.value;
                    const accent =
                      assignment.kind === 'split' ? 'var(--accent)' : chipAccentFor(dim.id, assignment.value);
                    const provenance = assignment.provenance === 'override' ? '⚲ pin' : assignment.provenance;
                    return (
                      <span key={dim.id} className="cost-table-cell-dim">
                        <span className="cost-chip" style={{ '--chip-accent': accent } as CSSProperties}>
                          {text}
                        </span>
                        <span className="cost-dim-provenance">{provenance}</span>
                      </span>
                    );
                  })}
                </div>
                {open && resolution && (
                  <div className="cost-cascade" style={{ gridColumn: '1 / -1' }}>
                    <span className="cost-cascade-header">resolution · first match wins</span>
                    {buildCascade(resolution, ruleById).map((entry) => (
                      <div key={entry.key} className="cost-cascade-row">
                        <span className="cost-cascade-id">{entry.id}</span>
                        <span className={`cost-cascade-name cost-cascade-name--${entry.kind}`}>{entry.name}</span>
                        <span className={`cost-cascade-line cost-cascade-line--${entry.kind}`}>{entry.line}</span>
                      </div>
                    ))}
                    <span className="cost-cascade-skipline">{`${resolution.didNotMatchCount} rules did not match`}</span>
                  </div>
                )}
              </div>
            );
          })}

          <div className="cost-table-footer">
            {pool.length > ROW_CAP
              ? `… ${pool.length - ROW_CAP} more resources — full inventory in the Inventory view`
              : `${pool.length} resources shown`}
          </div>
        </div>
      </div>
    </div>
  );
}
