// The Requirements explorer (spec §5): a filterable list of userReq + Rule
// rows; clicking a row reveals its chain — userReq → the Rules that verify
// it → their scenarios → proof, or (for a Rule row) straight to its
// scenarios → proof. Follows the design's explorer layout (filter chips,
// Kind/Requirement/Links/Status header, row-click-opens-chain), adapted to
// what the derived `TraceModel` actually carries:
//
//   • "SysReq" is labelled "Rule" — the validated model's own vocabulary
//     (spec §4.4: a system-requirement IS a Gherkin Rule).
//   • Diagnostics are rendered directly from `model.findings` rather than
//     re-deriving orphan/empty text locally — the model already computed the
//     message; this view only groups and shows it. Findings whose `slug` names
//     a userReq/Rule ROW attach to that row and reveal in its chain. But some
//     findings carry a slug that names NO row — e.g. an `orphan-feature`
//     finding carries the FEATURE's slug (`@workspec/trace-model`'s
//     `feature-derivation.ts`) — so they attach to nothing. Those are surfaced
//     EXPLICITLY in a dedicated Diagnostics section, and the Diagnostics
//     filter's count equals the FULL `model.findings` total: in a compliance
//     tool no finding may silently vanish from Diagnostics.
//   • A Rule with zero scenarios (`empty: true`) renders an EXPLICIT "no
//     scenarios yet" chain instead of silently showing nothing (spec §5's
//     "no-sysreq / empty-rule cases explicit" requirement).
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Finding, ScenarioNode, SysReqNode, TraceModel } from '@workspec/trace-model';
import { scenariosOf, verifiersOf } from '@workspec/trace-model';
import { PROOF_ACCENT, PROOF_LABEL, STATUS_ACCENT } from './format.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

/** Props for {@link RequirementsExplorer}. */
export interface RequirementsExplorerProps {
  model: TraceModel;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

type ExplorerFilter = 'all' | 'user' | 'rule' | 'diagnostics' | 'untested';

type RuleStatus = 'proven' | 'failing' | 'empty' | 'pending';

const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  proven: 'proven',
  failing: 'failing',
  empty: 'empty',
  pending: 'pending',
};

const RULE_STATUS_ACCENT: Record<RuleStatus, string> = {
  proven: 'var(--accent)',
  failing: 'var(--danger)',
  empty: 'var(--warn)',
  pending: 'var(--ink-fade)',
};

/** A Rule's display status: empty overrides failing overrides proven overrides pending. */
function ruleStatusOf(rule: SysReqNode, scenarios: readonly ScenarioNode[]): RuleStatus {
  if (rule.empty) return 'empty';
  if (scenarios.some((s) => s.proof === 'fail')) return 'failing';
  if (rule.ruleProven) return 'proven';
  return 'pending';
}

interface LinkChip {
  label: string;
  /** True when the referenced slug doesn't resolve in this model (a dangling ref). */
  broken: boolean;
}

interface Row {
  key: string;
  kind: 'UserReq' | 'Rule';
  slug: string;
  title: string;
  statusLabel: string;
  statusAccent: string;
  chips: LinkChip[];
  findings: Finding[];
  hasUntested: boolean;
}

/** The filterable Requirements explorer. Clicking a row reveals its chain. */
export function RequirementsExplorer(props: RequirementsExplorerProps): ReactElement {
  const { model, theme, className } = props;
  const [filter, setFilter] = useState<ExplorerFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const featureNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of model.features) map.set(feature.slug, feature.name);
    return map;
  }, [model.features]);

  const userReqSlugs = useMemo(
    () => new Set(model.userRequirements.map((u) => u.slug)),
    [model.userRequirements],
  );

  const findingsBySlug = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of model.findings) {
      if (finding.slug === undefined) continue;
      const bucket = map.get(finding.slug);
      if (bucket) bucket.push(finding);
      else map.set(finding.slug, [finding]);
    }
    return map;
  }, [model.findings]);

  // The slugs that DO own a row (userReq or Rule). A finding attaches to a row
  // only when its slug is one of these — so any finding with a slug outside
  // this set (an `orphan-feature` finding names a FEATURE; a scenario-level
  // dangling-ref names a scenario) attaches to nothing and would otherwise
  // never be counted or shown. We surface those explicitly instead.
  const rowSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const u of model.userRequirements) set.add(u.slug);
    for (const r of model.systemRequirements) set.add(r.slug);
    return set;
  }, [model.userRequirements, model.systemRequirements]);

  const unattachedFindings = useMemo(
    () => model.findings.filter((f) => f.slug === undefined || !rowSlugs.has(f.slug)),
    [model.findings, rowSlugs],
  );

  const rows: Row[] = useMemo(() => {
    const userRows: Row[] = model.userRequirements.map((u) => ({
      key: `UserReq:${u.slug}`,
      kind: 'UserReq' as const,
      slug: u.slug,
      title: u.title,
      statusLabel: u.status,
      statusAccent: STATUS_ACCENT[u.status],
      chips: u.features.map((slug) => ({
        label: featureNameBySlug.get(slug) ?? slug,
        broken: !featureNameBySlug.has(slug),
      })),
      findings: findingsBySlug.get(u.slug) ?? [],
      hasUntested: false,
    }));

    const ruleRows: Row[] = model.systemRequirements.map((r) => {
      const scenarios = scenariosOf(model, r.slug);
      const status = ruleStatusOf(r, scenarios);
      // The feature chip resolves to the feature's NAME; the "verifies" chips
      // stay bare SLUGS (matching the design's own `linkChipN(u, …)` — a
      // userReq ref renders as its slug, not its title, so it stays compact
      // and never collides with another row's own title text).
      const chips: LinkChip[] = [
        {
          label: featureNameBySlug.get(r.feature) ?? r.feature,
          broken: !featureNameBySlug.has(r.feature),
        },
        ...r.verifies.map((slug) => ({
          label: slug,
          broken: !userReqSlugs.has(slug),
        })),
      ];
      return {
        key: `Rule:${r.slug}`,
        kind: 'Rule' as const,
        slug: r.slug,
        title: r.title,
        statusLabel: RULE_STATUS_LABEL[status],
        statusAccent: RULE_STATUS_ACCENT[status],
        chips,
        findings: findingsBySlug.get(r.slug) ?? [],
        hasUntested: scenarios.some((s) => s.proof === 'unproven'),
      };
    });

    return [...userRows, ...ruleRows];
  }, [model, featureNameBySlug, userReqSlugs, findingsBySlug]);

  const filters: { id: ExplorerFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: rows.length },
    { id: 'user', label: 'User reqs', count: model.userRequirements.length },
    { id: 'rule', label: 'Rules', count: model.systemRequirements.length },
    {
      // The count is the FULL finding total — attached findings (revealed in
      // their row's chain) plus unattached ones (shown in the section below).
      id: 'diagnostics',
      label: 'Diagnostics',
      count: model.findings.length,
    },
    { id: 'untested', label: 'Has untested', count: rows.filter((r) => r.hasUntested).length },
  ];

  const filteredRows = rows.filter((row) => {
    if (filter === 'user') return row.kind === 'UserReq';
    if (filter === 'rule') return row.kind === 'Rule';
    if (filter === 'diagnostics') return row.findings.length > 0;
    if (filter === 'untested') return row.hasUntested;
    return true;
  });

  const orphanFeatures = model.features.filter((f) => f.orphan);

  function toggleRow(key: string): void {
    setSelectedKey((current) => (current === key ? null : key));
  }

  return (
    <TraceThemedRoot theme={theme} className={className}>
      <div className="trace-explorer">
        <div className="trace-explorer-filters">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`trace-filter-chip${filter === f.id ? ' trace-filter-chip--active' : ''}`}
              onClick={() => {
                setFilter(f.id);
                setSelectedKey(null);
              }}
            >
              {`${f.label} · ${f.count}`}
            </button>
          ))}
          <span className="trace-explorer-hint">click a row for its chain</span>
        </div>

        <div className="trace-explorer-header" role="row">
          <span className="trace-explorer-header-cell">Kind</span>
          <span className="trace-explorer-header-cell">Requirement</span>
          <span className="trace-explorer-header-cell">Links</span>
          <span className="trace-explorer-header-cell">Status</span>
        </div>

        {filteredRows.length === 0 &&
          !(filter === 'diagnostics' && unattachedFindings.length > 0) && (
            <div className="trace-explorer-empty">No requirements match this filter.</div>
          )}

        {filteredRows.map((row) => {
          const open = selectedKey === row.key;
          return (
            <div key={row.key} className="trace-explorer-row-group">
              <div
                className={`trace-explorer-row${open ? ' trace-explorer-row--open' : ''}`}
                onClick={() => toggleRow(row.key)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleRow(row.key);
                  }
                }}
              >
                <span className="trace-explorer-cell">
                  <span
                    className="trace-kind-chip"
                    style={
                      {
                        '--chip-accent':
                          row.kind === 'UserReq' ? 'var(--type-persona)' : 'var(--type-feature)',
                      } as CSSProperties
                    }
                  >
                    {row.kind}
                  </span>
                </span>
                <span className="trace-explorer-cell trace-explorer-cell-title">
                  <span className="trace-row-title">{row.title}</span>
                  <span className="trace-row-slug">{row.slug}</span>
                </span>
                <span className="trace-explorer-cell trace-explorer-cell-links">
                  {row.chips.map((chip, index) => (
                    <span
                      key={index}
                      className={`trace-link-chip${chip.broken ? ' trace-link-chip--broken' : ''}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </span>
                <span className="trace-explorer-cell">
                  <span
                    className="trace-status-pill"
                    style={{ '--chip-accent': row.statusAccent } as CSSProperties}
                  >
                    <span
                      className="trace-status-dot"
                      style={{ '--chip-accent': row.statusAccent } as CSSProperties}
                    />
                    {row.statusLabel}
                  </span>
                </span>
              </div>

              {open && <ExplorerChain model={model} row={row} />}
            </div>
          );
        })}

        {filter === 'diagnostics' && unattachedFindings.length > 0 && (
          <div className="trace-diagnostics-unattached">
            <div className="trace-diagnostics-unattached-label">
              {`findings not tied to a requirement row · ${unattachedFindings.length}`}
            </div>
            {unattachedFindings.map((finding, index) => (
              <div key={index} className="trace-diagnostics-unattached-row">
                <span
                  className="trace-kind-chip"
                  style={{ '--chip-accent': 'var(--warn)' } as CSSProperties}
                >
                  {finding.kind}
                </span>
                <div className="trace-diagnostic" data-severity={finding.severity}>
                  {finding.message}
                </div>
                {finding.slug !== undefined && (
                  <span className="trace-row-slug">{finding.slug}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="trace-explorer-footer">
          {orphanFeatures.length === 0
            ? 'all features covered'
            : `${orphanFeatures.length} orphan feature${orphanFeatures.length > 1 ? 's' : ''} (${orphanFeatures
                .map((f) => f.slug)
                .join(', ')}) — no userReqs or sysreqs yet`}
        </div>
      </div>
    </TraceThemedRoot>
  );
}

/** The reveal-on-click chain block, plus any findings attached to this row's slug. */
function ExplorerChain(props: { model: TraceModel; row: Row }): ReactElement {
  const { model, row } = props;
  return (
    <div className="trace-explorer-chain">
      {row.kind === 'UserReq' ? (
        <UserReqChain model={model} slug={row.slug} />
      ) : (
        <RuleChain model={model} slug={row.slug} />
      )}
      {row.findings.map((finding, index) => (
        <div key={index} className="trace-diagnostic" data-severity={finding.severity}>
          {finding.message}
        </div>
      ))}
    </div>
  );
}

/** userReq → the Rules that verify it → each Rule's scenarios → proof. */
function UserReqChain(props: { model: TraceModel; slug: string }): ReactElement {
  const rules = verifiersOf(props.model, props.slug);
  if (rules.length === 0) {
    return <div className="trace-chain-empty">No Rules verify this promise yet.</div>;
  }
  return (
    <div className="trace-chain-rules">
      <span className="trace-chain-label">{`verified by · ${rules.length} rule${rules.length === 1 ? '' : 's'}`}</span>
      {rules.map((rule) => (
        <div className="trace-chain-rule" key={rule.slug}>
          <span className="trace-chain-rule-title">{rule.title}</span>
          <RuleChain model={props.model} slug={rule.slug} />
        </div>
      ))}
    </div>
  );
}

/** A Rule's scenarios → proof — or the explicit empty-rule case (spec §5). */
function RuleChain(props: { model: TraceModel; slug: string }): ReactElement {
  const scenarios = scenariosOf(props.model, props.slug);
  if (scenarios.length === 0) {
    return (
      <div className="trace-chain-empty trace-chain-empty--warn">
        This Rule has no scenarios yet — a requirement with no proof.
      </div>
    );
  }
  return (
    <div className="trace-chain-scenarios">
      {scenarios.map((scenario) => (
        <div className="trace-chain-scenario-row" key={scenario.slug}>
          <span
            className="trace-proof-dot"
            style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
          />
          <span className="trace-chain-scenario-slug">{scenario.slug}</span>
          <span className="trace-chain-scenario-title">{scenario.title}</span>
          <span
            className="trace-pill"
            style={{ '--chip-accent': PROOF_ACCENT[scenario.proof] } as CSSProperties}
          >
            {PROOF_LABEL[scenario.proof]}
          </span>
        </div>
      ))}
    </div>
  );
}
