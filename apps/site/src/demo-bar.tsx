// Focused Cost workbench chrome. Retired Studio module tabs are deliberately
// omitted while their source remains available for a later reintroduction.
import type { ReactElement, ReactNode } from 'react';

export function WorkbenchBar(props: {
  /** The crumb's value slot, after "example ▸" — a static name (C4) or the
   *  worked-example switcher (Decisions; the switcher's own active-styled
   *  pill IS the "active example" signal, so crumb and switcher merge here). */
  crumb: ReactNode;
  /** Module actions (e.g. Decisions' Export ADR / Reset). Omit to leave the slot empty. */
  actions?: ReactNode;
}): ReactElement {
  const { crumb, actions } = props;
  return (
    <div className="wb-bar">
      <div className="wb-inner">
        <div className="wb-crumb">
          <span className="wb-crumb-eyebrow">example</span>
          <span className="wb-crumb-sep" aria-hidden="true">
            ▸
          </span>
          {crumb}
        </div>
        <span className="wb-spacer" />
        {actions !== undefined && <div className="wb-actions">{actions}</div>}
      </div>
    </div>
  );
}
