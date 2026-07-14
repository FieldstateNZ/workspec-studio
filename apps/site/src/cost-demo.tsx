// The Cost module's full-page demo (`/cost/demo`) — the real CostApp
// (Inventory / Attribution / Reports / Plan review) from
// `@workspec/cost-ui`, against a MemoryRepository seeded with the worked
// "fieldstate-azure" estate (see `cost-seed.ts`). Everything — rule
// toggles, the Fix-coverage promote-to-rule composer, rail reorder — runs in
// memory; nothing leaves the browser. Mirrors `demo.tsx` (Decisions): a full
// in-browser sandbox with `capabilities: { editAttribution: true }`, not
// `c4-demo.tsx`'s read-only showcase, since editing the ruleset live is the
// whole point of this module.
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  CostApp,
  CostStudioProvider,
  createInertLinkResolver,
} from '@workspec/cost-ui';
import type { CostStudioHost } from '@workspec/cost-ui';
import { useTheme } from '@workspec/design';
import '@workspec/cost-ui/styles.css';

import {
  COST_DEMO_ATTRIBUTION_REF,
  COST_DEMO_ESTATE_NAME,
  COST_DEMO_INVENTORY_REF,
  COST_DEMO_TAGPLAN_REF,
  createCostDemoRepository,
} from './cost-seed.js';
import { buildCostReportCsv, downloadCsv } from './export-cost.js';
import { WorkbenchBar } from './demo-bar.js';
import { SiteNav } from './nav.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

export function CostDemo(): ReactElement {
  // Bumping this token discards every in-browser edit by rebuilding the repo.
  const [resetToken, setResetToken] = useState(0);
  // The shell's own Dark/Light preference (Site Review UX pass, finding 03) —
  // never this component's own OS-preference listener.
  const theme = useTheme();

  const repository = useMemo(() => createCostDemoRepository(), [resetToken]);
  const host: CostStudioHost = useMemo(
    () => ({
      repository,
      links: createInertLinkResolver(),
      // A full in-memory sandbox: rail reorder/promotion/removal are all on.
      capabilities: { editAttribution: true },
    }),
    [repository],
  );

  async function onExportCsv(): Promise<void> {
    const { filename, csv } = await buildCostReportCsv(
      repository,
      COST_DEMO_INVENTORY_REF,
      COST_DEMO_ATTRIBUTION_REF,
    );
    downloadCsv(filename, csv);
  }

  return (
    <div className="demo">
      <SiteNav repoUrl={REPO_URL} />
      <WorkbenchBar
        crumb={<span className="wb-crumb-value">{COST_DEMO_ESTATE_NAME}</span>}
        actions={
          <>
            <button type="button" className="wb-action" onClick={() => void onExportCsv()}>
              Export CSV
            </button>
            <button
              type="button"
              className="wb-action-ghost"
              onClick={() => setResetToken((n) => n + 1)}
            >
              Reset
            </button>
          </>
        }
      />

      <p className="demo-note" role="note">
        Changes live only in your browser — the real thing writes <code>*.attribution.yaml</code>{' '}
        files in your repo.{' '}
        <span className="demo-blurb">
          80 resources across 9 resource groups, extended to 100% coverage on the primary
          dimension — the same worked example the CLI's own docs walk through.
        </span>
      </p>

      <CostStudioProvider host={host} theme={theme}>
        <main className="demo-stage" key={resetToken}>
          <CostApp
            inventoryRef={COST_DEMO_INVENTORY_REF}
            attributionRef={COST_DEMO_ATTRIBUTION_REF}
            tagPlanRef={COST_DEMO_TAGPLAN_REF}
          />
        </main>
      </CostStudioProvider>
    </div>
  );
}
