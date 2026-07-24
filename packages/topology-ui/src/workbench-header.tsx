// The workbench header: `workspec-topology / <slug>`, the topology title,
// the env + lens segmented controls, the counts string, and (when the host
// component opts in) a Topology/Drift/Cost view-nav row — ported from the
// design's header + view-nav rows.

import type { ReactElement } from 'react';
import type { LensId } from '@workspec/topology-model';
import { EnvSwitcher } from './env-switcher.js';
import { LensSwitcher } from './lens-switcher.js';
import { ViewSwitcher } from './view-switcher.js';
import type { WorkbenchView } from './view-switcher.js';

/** Props for {@link WorkbenchHeader}. */
export interface WorkbenchHeaderProps {
  slug: string;
  title: string;
  environments: readonly string[];
  env: string;
  onEnvChange: (envSlug: string) => void;
  lens: LensId;
  onLensChange: (lens: LensId) => void;
  counts: string;
  /**
   * OPTIONAL payload-view state (P5/P6). Omitting BOTH `view` and
   * `onViewChange` renders exactly as this component always has — no
   * view-nav row, lens switcher always shown — so a host that builds its own
   * layout from this composable piece sees no behaviour change. Passing
   * both adds the Topology/Drift/Cost row and hides the lens switcher
   * whenever `view !== 'topology'` (the lens still applies to the
   * canvas/side panel underneath, it just isn't switchable from a
   * non-topology view).
   */
  view?: WorkbenchView;
  onViewChange?: (view: WorkbenchView) => void;
}

export function WorkbenchHeader(props: WorkbenchHeaderProps): ReactElement {
  const { slug, title, environments, env, onEnvChange, lens, onLensChange, counts, view, onViewChange } =
    props;
  const showViewNav = view !== undefined && onViewChange !== undefined;

  return (
    <div className="tp-header-group">
      <div className="tp-header">
        <div className="tp-header-title">
          <div className="tp-header-eyebrow">
            <span className="tp-header-dot" />
            <span className="tp-header-package">workspec-topology</span>
            <span className="tp-header-slug">{`/ ${slug}`}</span>
          </div>
          <h1 className="tp-header-heading">{title}</h1>
        </div>
        <span className="tp-header-spacer" />
        <div className="tp-header-controls">
          <div className="tp-header-switches">
            <EnvSwitcher environments={environments} value={env} onChange={onEnvChange} />
            {(!showViewNav || view === 'topology') && (
              <LensSwitcher value={lens} onChange={onLensChange} />
            )}
          </div>
          <span className="tp-header-counts">{counts}</span>
        </div>
      </div>
      {showViewNav && (
        <div className="tp-header-viewnav">
          <ViewSwitcher value={view} onChange={onViewChange} />
        </div>
      )}
    </div>
  );
}
