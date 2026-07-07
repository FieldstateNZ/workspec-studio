// The Catalog view. A clean editor over the SIMPLE catalog model (porting
// decision P3) — SKUs (label/family/price), pricing modes (mult/committed), and
// schedules (pct) — NOT the prototype's rich provider/resource model, which was
// deferred to Enterprise. Gated on `capabilities.editCatalog`: when false the
// tables render read-only; when true, edits update a local draft and persist
// through the repository port (`useWriteCatalog`). Because the write mutation
// refreshes the catalog query cache, every option that references this catalog
// reprices in the Workspace and Compare views.

import { useState } from 'react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import type { Catalog, Ref } from '@workspec/decision-schema';
import { useCapabilities, useCatalog, useWriteCatalog } from './context.js';
import {
  addPricingMode,
  addSchedule,
  addSku,
  removePricingMode,
  removeSchedule,
  removeSku,
  setPricingMode,
  setSchedule,
  setSku,
} from './catalog-edits.js';
import { Icon } from './primitives.js';

/** Props for {@link DecisionCatalog}. */
export interface DecisionCatalogProps {
  /** The ref of the catalog artifact to browse / edit. */
  catalogRef: Ref;
}

type CatalogTab = 'skus' | 'pricing' | 'schedules';

function Notice(props: { tone: 'muted' | 'error'; children: string }): ReactElement {
  return (
    <div className={props.tone === 'error' ? 'ds-notice ds-notice-error' : 'ds-notice'}>
      {props.children}
    </div>
  );
}

/** Load a catalog and render its editor. */
export function DecisionCatalog(props: DecisionCatalogProps): ReactElement {
  const { catalogRef } = props;
  const catalogQuery = useCatalog(catalogRef);

  if (catalogQuery.isPending) return <Notice tone="muted">Loading catalog…</Notice>;
  if (catalogQuery.isError)
    return <Notice tone="error">{`Could not load catalog: ${catalogQuery.error.message}`}</Notice>;
  const catalog = catalogQuery.data;
  if (catalog === undefined) return <Notice tone="error">Catalog not found.</Notice>;

  return <CatalogView key={catalogRef} catalogRef={catalogRef} initialCatalog={catalog} />;
}

// ── Small editor primitives (ported from the prototype, re-tokenised) ──────────

function numberFromEvent(e: ChangeEvent<HTMLInputElement>): number {
  return e.target.value === '' ? 0 : Number(e.target.value);
}

function TextCell(props: {
  editable: boolean;
  value: string;
  ariaLabel: string;
  mono?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}): ReactElement {
  if (!props.editable) {
    return <span className={props.mono ? 'ds-cat-ro ds-mono' : 'ds-cat-ro'}>{props.value}</span>;
  }
  return (
    <span className={props.mono ? 'ds-catinput ds-mono' : 'ds-catinput'}>
      <input
        type="text"
        aria-label={props.ariaLabel}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </span>
  );
}

function NumberCell(props: {
  editable: boolean;
  value: number;
  ariaLabel: string;
  prefix?: string;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}): ReactElement {
  const shown = `${props.prefix ?? ''}${props.value}${props.suffix ?? ''}`;
  if (!props.editable) {
    return <span className="ds-cat-ro ds-mono">{shown}</span>;
  }
  return (
    <span className="ds-catinput ds-mono">
      {props.prefix !== undefined && <span className="ds-cat-affix">{props.prefix}</span>}
      <input
        type="number"
        min={0}
        step={props.step ?? 1}
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => props.onChange(numberFromEvent(e))}
      />
      {props.suffix !== undefined && <span className="ds-cat-affix">{props.suffix}</span>}
    </span>
  );
}

function CommittedToggle(props: {
  editable: boolean;
  value: boolean;
  ariaLabel: string;
  onChange: (value: boolean) => void;
}): ReactElement {
  if (!props.editable) {
    return <span className="ds-cat-ro ds-mono">{props.value ? 'committed' : 'on-demand'}</span>;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.value}
      aria-label={props.ariaLabel}
      className={props.value ? 'ds-cattoggle ds-cattoggle-on' : 'ds-cattoggle'}
      onClick={() => props.onChange(!props.value)}
    >
      <span className="ds-cattoggle-sw" aria-hidden="true" />
    </button>
  );
}

function DeleteButton(props: { label: string; onClick: () => void }): ReactElement {
  return (
    <button type="button" className="ds-cc-del" aria-label={props.label} onClick={props.onClick}>
      <Icon.x className="ds-btn-icon" />
    </button>
  );
}

function AddRow(props: { label: string; onClick: () => void }): ReactElement {
  return (
    <div className="ds-addrow">
      <button type="button" onClick={props.onClick}>
        <Icon.plus className="ds-btn-icon" /> {props.label}
      </button>
    </div>
  );
}

function SectionLabel(props: { title: string; note: string }): ReactElement {
  return (
    <div className="ds-sectlabel">
      <h3>{props.title}</h3>
      <span className="ds-ln" />
      <span className="ds-ct">{props.note}</span>
    </div>
  );
}

function CatTable(props: { head: ReactNode; children: ReactNode }): ReactElement {
  return (
    <table className="ds-cattable">
      <thead>{props.head}</thead>
      <tbody>{props.children}</tbody>
    </table>
  );
}

// ── The editor ─────────────────────────────────────────────────────────────────

function CatalogView(props: { catalogRef: Ref; initialCatalog: Catalog }): ReactElement {
  const { catalogRef, initialCatalog } = props;
  const capabilities = useCapabilities();
  const editable = capabilities.editCatalog;
  const writeCatalog = useWriteCatalog();

  const [draft, setDraft] = useState<Catalog>(initialCatalog);
  const [tab, setTab] = useState<CatalogTab>('skus');

  const commit = (next: Catalog): void => {
    setDraft(next);
    writeCatalog.mutate({ ref: catalogRef, catalog: next });
  };

  const { skus, pricingModes, schedules } = draft.spec;

  return (
    <div className="ds-wrap ds-wide">
      <div className="ds-dechead">
        <div className="ds-dechead-meta">
          <div className="ds-eyebrow">Cost catalog · the priced tables every model draws from</div>
          <h1 className="ds-dechead-title">{draft.metadata.name ?? 'Cost catalog'}</h1>
          <p className="ds-ctx">
            {`${draft.metadata.currency} · prices as of ${draft.metadata.asOf}. `}
            SKUs, pricing modes and schedules feed the engine directly — editing a price reprices
            every option that references it.
          </p>
        </div>
        <div className="ds-actions">
          <span className={`ds-status ds-status-${editable ? 'decided' : 'exploring'}`}>
            <span className="ds-status-dot" aria-hidden="true" />
            {editable ? 'Editable · reprices live' : 'Read-only'}
          </span>
        </div>
      </div>

      <div className="ds-catnav" role="tablist" aria-label="Catalog sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'skus'}
          className={tab === 'skus' ? 'ds-on' : ''}
          onClick={() => setTab('skus')}
        >
          SKUs <span className="ds-n">{skus.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pricing'}
          className={tab === 'pricing' ? 'ds-on' : ''}
          onClick={() => setTab('pricing')}
        >
          Pricing modes <span className="ds-n">{pricingModes.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedules'}
          className={tab === 'schedules' ? 'ds-on' : ''}
          onClick={() => setTab('schedules')}
        >
          Schedules <span className="ds-n">{schedules.length}</span>
        </button>
      </div>

      <div className="ds-catbody">
        {tab === 'skus' && (
          <>
            <SectionLabel
              title="SKUs"
              note="priced catalogue items · monthly PAYG list price per unit"
            />
            <CatTable
              head={
                <tr>
                  <th className="ds-l">SKU</th>
                  <th className="ds-l">Family</th>
                  <th>Price / mo</th>
                  {editable && <th className="ds-cat-actioncol" />}
                </tr>
              }
            >
              {skus.map((sku) => (
                <tr key={sku.id}>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={sku.label}
                      ariaLabel={`${sku.label} label`}
                      onChange={(label) => commit(setSku(draft, sku.id, { label }))}
                    />
                  </td>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={sku.family}
                      ariaLabel={`${sku.label} family`}
                      onChange={(family) => commit(setSku(draft, sku.id, { family }))}
                    />
                  </td>
                  <td className="ds-num">
                    <NumberCell
                      editable={editable}
                      value={sku.price}
                      ariaLabel={`${sku.label} price`}
                      prefix="$"
                      onChange={(price) => commit(setSku(draft, sku.id, { price }))}
                    />
                  </td>
                  {editable && (
                    <td className="ds-cat-actioncol">
                      <DeleteButton
                        label={`Delete ${sku.label}`}
                        onClick={() => commit(removeSku(draft, sku.id))}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </CatTable>
            {editable && (
              <AddRow
                label="Add SKU"
                onClick={() => {
                  const { catalog: next } = addSku(draft);
                  commit(next);
                }}
              />
            )}
          </>
        )}

        {tab === 'pricing' && (
          <>
            <SectionLabel
              title="Pricing modes"
              note="named multipliers on the PAYG list price · committed modes bill 24×7"
            />
            <CatTable
              head={
                <tr>
                  <th className="ds-l">Mode</th>
                  <th className="ds-l">Short</th>
                  <th>× mult</th>
                  <th>Committed</th>
                  {editable && <th className="ds-cat-actioncol" />}
                </tr>
              }
            >
              {pricingModes.map((mode) => (
                <tr key={mode.id}>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={mode.label}
                      ariaLabel={`${mode.label} name`}
                      onChange={(label) => commit(setPricingMode(draft, mode.id, { label }))}
                    />
                  </td>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={mode.short ?? ''}
                      ariaLabel={`${mode.label} short label`}
                      mono
                      onChange={(short) => commit(setPricingMode(draft, mode.id, { short }))}
                    />
                  </td>
                  <td className="ds-num">
                    <NumberCell
                      editable={editable}
                      value={mode.mult}
                      ariaLabel={`${mode.label} multiplier`}
                      prefix="×"
                      step={0.01}
                      onChange={(mult) => commit(setPricingMode(draft, mode.id, { mult }))}
                    />
                  </td>
                  <td className="ds-num">
                    <CommittedToggle
                      editable={editable}
                      value={mode.committed}
                      ariaLabel={`${mode.label} committed`}
                      onChange={(committed) =>
                        commit(setPricingMode(draft, mode.id, { committed }))
                      }
                    />
                  </td>
                  {editable && (
                    <td className="ds-cat-actioncol">
                      <DeleteButton
                        label={`Delete ${mode.label}`}
                        onClick={() => commit(removePricingMode(draft, mode.id))}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </CatTable>
            {editable && (
              <AddRow
                label="Add pricing mode"
                onClick={() => {
                  const { catalog: next } = addPricingMode(draft);
                  commit(next);
                }}
              />
            )}
          </>
        )}

        {tab === 'schedules' && (
          <>
            <SectionLabel
              title="Schedules"
              note="share of the ~730-hour month a line runs · committed pricing ignores this"
            />
            <CatTable
              head={
                <tr>
                  <th className="ds-l">Schedule</th>
                  <th>Uptime %</th>
                  <th className="ds-l">Note</th>
                  {editable && <th className="ds-cat-actioncol" />}
                </tr>
              }
            >
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={schedule.label}
                      ariaLabel={`${schedule.label} name`}
                      onChange={(label) => commit(setSchedule(draft, schedule.id, { label }))}
                    />
                  </td>
                  <td className="ds-num">
                    <NumberCell
                      editable={editable}
                      value={Math.round(schedule.pct * 100)}
                      ariaLabel={`${schedule.label} uptime percent`}
                      suffix="%"
                      onChange={(pct) =>
                        commit(setSchedule(draft, schedule.id, { pct: pct / 100 }))
                      }
                    />
                  </td>
                  <td className="ds-l">
                    <TextCell
                      editable={editable}
                      value={schedule.note ?? ''}
                      ariaLabel={`${schedule.label} note`}
                      placeholder="—"
                      onChange={(note) => commit(setSchedule(draft, schedule.id, { note }))}
                    />
                  </td>
                  {editable && (
                    <td className="ds-cat-actioncol">
                      <DeleteButton
                        label={`Delete ${schedule.label}`}
                        onClick={() => commit(removeSchedule(draft, schedule.id))}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </CatTable>
            {editable && (
              <AddRow
                label="Add schedule"
                onClick={() => {
                  const { catalog: next } = addSchedule(draft);
                  commit(next);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
