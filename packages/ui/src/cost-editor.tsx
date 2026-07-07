// The live cost model editor (the expanded body of an option card). Faithful to
// the prototype's table view: grouped lines, per-line SKU / mode / schedule
// pickers (populated from the catalog), per-env quantity or flat-amount inputs,
// estimate flags, a criteria score editor, and the optimisation-levers rail.
// Every edit calls back to the workspace, which reprices via the engine — this
// component never does cost math itself beyond reading the engine's results.

import { useMemo } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { applyLevers } from '@workspec/decision-engine';
import type { OptionCost } from '@workspec/decision-engine';
import type {
  Catalog,
  Criterion,
  Decision,
  Line,
  Option,
  PricingMode,
  Schedule,
  Sku,
} from '@workspec/decision-schema';
import { money } from './format.js';
import { Picker, ScoreDots } from './primitives.js';
import type { PickerItem } from './primitives.js';

const GROUP_LABEL: Record<string, string> = {
  compute: 'Compute',
  data: 'Data',
  platform: 'Platform / shared',
};

type SkuLine = Extract<Line, { flat: false }>;

/** Callbacks the editor invokes; the workspace turns them into engine repricing. */
export interface CostEditorCallbacks {
  onToggleLever: (leverId: string) => void;
  onLineField: (lineId: string, patch: Partial<Pick<SkuLine, 'sku' | 'mode' | 'schedule'>>) => void;
  onLineQty: (lineId: string, env: string, qty: number) => void;
  onLineAmount: (lineId: string, env: string, amount: number) => void;
  onToggleEnv: (env: string) => void;
  onScore: (criterionId: string, score: number) => void;
}

export interface CostEditorProps extends CostEditorCallbacks {
  option: Option;
  decision: Decision;
  catalog: Catalog;
  criteria: Criterion[];
  cost: OptionCost;
}

/** Which enabled lever (if any) drives `field` on this line — for the "locked" pill. */
function leverLockerFor(option: Option, lineId: string, field: 'mode' | 'schedule'): string | null {
  const base = option.lines.find((l) => l.id === lineId);
  if (base === undefined || base.flat) return null;
  for (const lever of option.levers ?? []) {
    if (lever.enabled !== true) continue;
    const applied = applyLevers({ ...option, levers: [{ ...lever, enabled: true }] });
    const al = applied.find((l) => l.id === lineId);
    if (al === undefined || al.flat) continue;
    if (field === 'mode' && al.mode !== base.mode) return lever.label;
    if (field === 'schedule' && al.schedule !== base.schedule) return lever.label;
  }
  return null;
}

function intFromEvent(e: ChangeEvent<HTMLInputElement>): number {
  return Math.max(0, Math.trunc(Number(e.target.value) || 0));
}

function SkuPill(props: {
  line: SkuLine;
  catalog: Catalog;
  onSelect: (sku: string) => void;
}): ReactElement | null {
  const sku = props.catalog.spec.skus.find((s) => s.id === props.line.sku);
  const byFamily = new Map<string, Sku[]>();
  for (const s of props.catalog.spec.skus) {
    const arr = byFamily.get(s.family) ?? [];
    arr.push(s);
    byFamily.set(s.family, arr);
  }
  const items: PickerItem[] = [...byFamily.values()].flat().map((s) => ({
    value: s.id,
    label: s.label,
    meta: s.price > 0 ? `$${s.price}` : 'usage',
    active: s.id === props.line.sku,
  }));
  return (
    <Picker
      label={`SKU for ${props.line.label}`}
      triggerClassName="ds-skupill"
      triggerTitle={sku ? `${sku.family} · $${sku.price}/mo list` : 'Unknown SKU'}
      triggerLabel={sku?.label ?? props.line.sku}
      items={items}
      onSelect={props.onSelect}
    />
  );
}

function ModePill(props: {
  line: SkuLine;
  appliedMode: string;
  catalog: Catalog;
  locker: string | null;
  onSelect: (mode: string) => void;
}): ReactElement {
  const modes = props.catalog.spec.pricingModes;
  const eff: PricingMode | undefined = modes.find((m) => m.id === props.appliedMode);
  const driven = props.appliedMode !== props.line.mode;
  const cls = ['ds-modepill'];
  if (eff?.committed) cls.push('ds-modepill-committed');
  if (props.appliedMode === 'spot') cls.push('ds-modepill-spot');
  const shown = `${eff?.short ?? eff?.label ?? props.appliedMode}${driven ? ' ◂' : ''}`;

  if (driven) {
    return (
      <span className={cls.join(' ')} title={`Set by lever: ${props.locker ?? ''}`}>
        {shown}
      </span>
    );
  }
  return (
    <Picker
      label={`Pricing mode for ${props.line.label}`}
      triggerClassName={cls.join(' ')}
      triggerTitle={eff?.note}
      triggerLabel={shown}
      items={modes.map((m) => ({
        value: m.id,
        label: m.label,
        meta: `×${m.mult}`,
        active: m.id === props.appliedMode,
      }))}
      onSelect={props.onSelect}
    />
  );
}

function SchedPill(props: {
  line: SkuLine;
  appliedSchedule: string;
  catalog: Catalog;
  locker: string | null;
  onSelect: (schedule: string) => void;
}): ReactElement {
  const schedules = props.catalog.spec.schedules;
  const eff: Schedule | undefined = schedules.find((s) => s.id === props.appliedSchedule);
  const driven = props.appliedSchedule !== props.line.schedule;
  const cls = driven ? 'ds-schedpill ds-schedpill-driven' : 'ds-schedpill';
  const shown = `${eff?.label ?? props.appliedSchedule}${driven ? ' ◂' : ''}`;

  if (driven) {
    return (
      <span className={cls} title={`Set by lever: ${props.locker ?? ''}`}>
        {shown}
      </span>
    );
  }
  return (
    <Picker
      label={`Schedule for ${props.line.label}`}
      triggerClassName={cls}
      triggerTitle="Uptime / schedule"
      triggerLabel={shown}
      items={schedules.map((s) => ({
        value: s.id,
        label: s.label,
        meta: `${Math.round(s.pct * 100)}%`,
        active: s.id === props.appliedSchedule,
      }))}
      onSelect={props.onSelect}
    />
  );
}

export function CostEditor(props: CostEditorProps): ReactElement {
  const { option, decision, catalog, criteria, cost } = props;
  const envs = cost.activeEnvs;

  const appliedById = useMemo(() => {
    const map = new Map<string, Line>();
    for (const line of applyLevers(option)) map.set(line.id, line);
    return map;
  }, [option]);

  const rowById = useMemo(() => {
    const map = new Map<string, (typeof cost.lineRows)[number]>();
    for (const row of cost.lineRows) map.set(row.lineId, row);
    return map;
  }, [cost]);

  // Group lines preserving first-seen order.
  const groups: { key: string; rows: Line[] }[] = [];
  for (const line of option.lines) {
    const key = line.group ?? 'other';
    let g = groups.find((x) => x.key === key);
    if (g === undefined) {
      g = { key, rows: [] };
      groups.push(g);
    }
    g.rows.push(line);
  }

  return (
    <div className="ds-editor">
      <div className="ds-editor-inner">
        <div className="ds-calc">
          <div className="ds-calc-toolbar">
            <span className="ds-eyebrow">Cost model</span>
            <span className="ds-spacer" />
            <span className="ds-eyebrow ds-tnum">
              {money(cost.monthly)}/mo · {money(cost.annual)}/yr
            </span>
          </div>

          <div className="ds-calc-toolbar">
            <span className="ds-eyebrow">Environments</span>
            <div className="ds-envtoggles">
              {decision.spec.environments.map((e) => {
                const on = option.environments.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    className={on ? 'ds-et ds-et-on' : 'ds-et'}
                    aria-pressed={on}
                    onClick={() => props.onToggleEnv(e)}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>

          <table className="ds-ctable">
            <thead>
              <tr>
                <th className="ds-l" style={{ width: '30%' }}>
                  Component
                </th>
                <th className="ds-l">Config</th>
                {envs.map((e) => (
                  <th key={e}>{e}</th>
                ))}
                <th>/mo</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr className="ds-grouprow">
                  <td colSpan={3 + envs.length}>{GROUP_LABEL[g.key] ?? g.key}</td>
                </tr>
                {g.rows.map((line) => {
                  const applied = appliedById.get(line.id);
                  const row = rowById.get(line.id);
                  const isSku = !line.flat;
                  const estimate = line.flat ? line.estimate === true : false;
                  return (
                    <tr key={line.id}>
                      <td>
                        <span className="ds-lname">
                          {line.label}
                          {estimate && (
                            <span
                              className="ds-est"
                              title="Estimated from list price — pending real usage data"
                            >
                              EST
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        {isSku && applied && !applied.flat ? (
                          <span className="ds-config">
                            <SkuPill
                              line={line as SkuLine}
                              catalog={catalog}
                              onSelect={(sku) => props.onLineField(line.id, { sku })}
                            />
                            <ModePill
                              line={line as SkuLine}
                              appliedMode={applied.mode}
                              catalog={catalog}
                              locker={leverLockerFor(option, line.id, 'mode')}
                              onSelect={(mode) => props.onLineField(line.id, { mode })}
                            />
                            <SchedPill
                              line={line as SkuLine}
                              appliedSchedule={applied.schedule}
                              catalog={catalog}
                              locker={leverLockerFor(option, line.id, 'schedule')}
                              onSelect={(schedule) => props.onLineField(line.id, { schedule })}
                            />
                          </span>
                        ) : (
                          <span className="ds-fixedtag">fixed · {line.group ?? 'other'}</span>
                        )}
                      </td>
                      {envs.map((e) => {
                        const envCost = row?.envCosts[e] ?? 0;
                        if (!line.flat) {
                          const q = line.qty[e] ?? 0;
                          return (
                            <td key={e} className="ds-num">
                              <div className="ds-qtycell">
                                <input
                                  className="ds-qtybox"
                                  type="number"
                                  min={0}
                                  aria-label={`${line.label} ${e} quantity`}
                                  value={q}
                                  onChange={(ev) => props.onLineQty(line.id, e, intFromEvent(ev))}
                                />
                                <span className="ds-qtycost">{envCost ? money(envCost) : '—'}</span>
                              </div>
                            </td>
                          );
                        }
                        const amt = line.amount[e] ?? 0;
                        return (
                          <td key={e} className={amt ? 'ds-num' : 'ds-num ds-zero'}>
                            <input
                              className="ds-qtybox ds-amountbox"
                              type="number"
                              min={0}
                              aria-label={`${line.label} ${e} amount`}
                              value={amt}
                              onChange={(ev) => props.onLineAmount(line.id, e, intFromEvent(ev))}
                            />
                          </td>
                        );
                      })}
                      <td className="ds-num ds-linetotal">
                        {row?.monthly ? money(row.monthly) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <td className="ds-l">Monthly</td>
                <td />
                {envs.map((e) => (
                  <td key={e} className="ds-num">
                    {money(cost.perEnv[e] ?? 0)}
                  </td>
                ))}
                <td className="ds-num ds-grand">{money(cost.monthly)}</td>
              </tr>
              <tr>
                <td className="ds-l">Annual</td>
                <td />
                {envs.map((e) => (
                  <td key={e} className="ds-num">
                    {money((cost.perEnv[e] ?? 0) * 12)}
                  </td>
                ))}
                <td className="ds-num ds-grand">{money(cost.annual)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="ds-critedit">
            <div className="ds-sectlabel">
              <h3>Non-cost criteria</h3>
              <span className="ds-ln" />
              <span className="ds-ct">score + note · lightweight</span>
            </div>
            {criteria.map((c) => {
              const v = option.scores[c.id] ?? { score: 0 };
              return (
                <div className="ds-cr" key={c.id}>
                  <span className="ds-cr-lab" title={c.hint}>
                    {c.label}
                  </span>
                  <ScoreDots
                    value={v.score}
                    label={`${c.label} score`}
                    onChange={(n) => props.onScore(c.id, n)}
                  />
                  <span className="ds-cr-note">{v.note ?? ''}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ds-levers">
          <h4>Optimisation levers</h4>
          <p className="ds-levers-sub">Toggle assumptions; the model reprices live.</p>
          {(option.levers ?? []).map((lever) => {
            const on = lever.enabled === true;
            return (
              <button
                key={lever.id}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={lever.label}
                className={on ? 'ds-lever ds-lever-on' : 'ds-lever'}
                onClick={() => props.onToggleLever(lever.id)}
              >
                <span className="ds-sw" aria-hidden="true" />
                <span className="ds-lever-text">
                  <span className="ds-lt">{lever.label}</span>
                  {lever.hint !== undefined && <span className="ds-lh">{lever.hint}</span>}
                </span>
              </button>
            );
          })}

          <div className="ds-opt-savings">
            <div className="ds-savings-row">
              <span className="ds-savings-k">Current annual</span>
              <span className="ds-savings-v ds-tnum">{money(cost.annual)}</span>
            </div>
            {cost.headroom > 0 && (
              <div className="ds-savings-hint">
                ↓ {money(cost.headroom)}/mo more available by reserving steady prod compute.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
