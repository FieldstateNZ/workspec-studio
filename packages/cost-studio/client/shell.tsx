// The standalone host chrome: a slim topbar (brand + example crumb + theme
// toggle + rule/resource counts) wrapping the mounted CostApp. It lives
// INSIDE the provider, so it reads the inventory/attribution/tag-plan lists
// through the same repository port (`useInventories` etc.) the views use.
// Theme is lifted to `main.tsx`, which owns the `theme` prop the provider
// applies as `data-theme`.
//
// This shell does NOT re-render a brand crumb, precedence pill, or coverage
// figure inside the workbench body — `CostApp`'s `.cost-appbar` already owns
// the view tabs, and `AttributionWorkbench`'s coverage row already owns the
// "first match wins" precedence pill and the live coverage percentage (see
// `packages/cost-ui/src/attribution-workbench.tsx`). This topbar is
// deliberately complementary: brand identity, which example is loaded, the
// Dark/Light toggle, and a *static* rule/resource count the workbench body
// doesn't show anywhere itself.
//
// The standalone shell auto-selects the first discovered inventory +
// attribution (+ tag plan, if any) rather than offering a picker —
// `workspec-cost report`/`plan` already assume exactly one of each in scope,
// and C5b ships no multi-artifact picker UI.

import type { ReactNode } from 'react';
import {
  CostApp,
  useAttribution,
  useAttributions,
  useInventories,
  useInventory,
  useTagPlans,
} from '@workspec/cost-ui';
import type { ThemeName } from '@workspec/cost-ui';

export interface ShellProps {
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
}

const THEME_OPTIONS: ThemeName[] = ['dark', 'light'];

export function Shell(props: ShellProps): ReactNode {
  const inventories = useInventories();
  const attributions = useAttributions();
  const tagPlans = useTagPlans();

  const firstInventory = inventories.data?.[0];
  const firstAttribution = attributions.data?.[0];
  const firstTagPlan = tagPlans.data?.[0];

  const inventory = useInventory(firstInventory?.ref);
  const attribution = useAttribution(firstAttribution?.ref);

  const ruleCount = attribution.data?.spec.rules.length;
  const resourceCount = inventory.data?.spec.resources.length;

  const listsPending = inventories.isPending || attributions.isPending;
  const listsError = inventories.isError || attributions.isError;
  const errorMessage = inventories.error?.message ?? attributions.error?.message;

  return (
    <>
      <header className="csh-topbar">
        <span className="csh-glyph" aria-hidden="true" />
        <span className="csh-brand">workspec-cost</span>
        <span className="csh-slash">/ studio</span>
        {firstInventory !== undefined && (
          <span className="csh-crumb">{`example ▸ ${firstInventory.name ?? firstInventory.slug ?? firstInventory.ref}`}</span>
        )}
        <span className="csh-spacer" />
        <div className="csh-toggle" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`csh-toggle-seg${props.theme === option ? ' csh-toggle-seg--active' : ''}`}
              aria-pressed={props.theme === option}
              onClick={() => props.onSelectTheme(option)}
            >
              {option === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
        {ruleCount !== undefined && resourceCount !== undefined && (
          <span className="csh-counts">{`${ruleCount} rules · ${resourceCount} resources`}</span>
        )}
      </header>

      <main className="csh-main">
        {listsError ? (
          <div className="csh-empty">{`Could not reach the host API: ${errorMessage ?? 'unknown error'}`}</div>
        ) : firstInventory !== undefined && firstAttribution !== undefined ? (
          <CostApp
            inventoryRef={firstInventory.ref}
            attributionRef={firstAttribution.ref}
            {...(firstTagPlan !== undefined ? { tagPlanRef: firstTagPlan.ref } : {})}
          />
        ) : (
          <div className="csh-empty">
            {listsPending
              ? 'Loading…'
              : 'No inventory + attribution found under this directory — run "workspec-cost stocktake" and author an *.attribution.yaml to begin.'}
          </div>
        )}
      </main>
    </>
  );
}
