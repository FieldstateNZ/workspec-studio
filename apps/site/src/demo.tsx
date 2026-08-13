// The in-browser demo. Mounts the repository-native Decision editor and ADR
// preview against a MemoryRepository seeded with two worked examples.
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  DecisionApp,
  DecisionStudioProvider,
  createInertLinkResolver,
} from '@workspec/decision-ui';
import { Button } from '@workspec/design/components';
import { useTheme } from '@workspec/design';
import type { DecisionStudioHost } from '@workspec/decision-ui';
import '@workspec/decision-ui/styles.css';

import { DEMO_EXAMPLES, createDemoRepository } from './seed.js';
import { downloadText, renderAdr } from './export-adr.js';
import { WorkbenchBar } from './demo-bar.js';
import { SiteNav } from './nav.js';

// Same source Decisions' own pitch page (decisions.tsx) links GitHub to — the
// demo shares the module's identity, so it shares its repo target too.
const REPO_URL = 'https://github.com/FieldstateNZ/workspec-decision-studio';

export function Demo(): ReactElement {
  const [exampleKey, setExampleKey] = useState<string>(DEMO_EXAMPLES[0]?.key ?? 'hosting');
  // Bumping this token discards every in-browser edit by rebuilding the repo.
  const [resetToken, setResetToken] = useState(0);
  // The shell's own Dark/Light preference (Site Review UX pass, finding 03) —
  // never this component's own OS-preference listener.
  const theme = useTheme();

  const repository = useMemo(() => createDemoRepository(), [resetToken]);
  const host: DecisionStudioHost = useMemo(
    () => ({
      repository,
      links: createInertLinkResolver(),
      capabilities: { editDecision: true },
    }),
    [repository],
  );

  const active = DEMO_EXAMPLES.find((example) => example.key === exampleKey) ?? DEMO_EXAMPLES[0];
  if (active === undefined) throw new Error('demo: no examples seeded');
  // Captured outside the closure below: TS doesn't carry the guard above's
  // narrowing of `active` into a separately-declared nested function.
  const activeDecisionRef = active.decisionRef;

  async function onExportAdr(): Promise<void> {
    const { filename, markdown } = await renderAdr(repository, activeDecisionRef);
    downloadText(filename, markdown);
  }

  return (
    <div className="demo">
      <SiteNav repoUrl={REPO_URL} />
      <WorkbenchBar
        crumb={
          // A toggle button group, not an ARIA tablist — these switch the
          // seeded example, they don't reveal tabpanels. It sits where the
          // mockup's static crumb value would go: the active-styled pill IS
          // the "active example" signal (Studio redesign, round 3).
          <div className="demo-examples" role="group" aria-label="Worked examples">
            {DEMO_EXAMPLES.map((example) => (
              <Button
                key={example.key}
                size="sm"
                variant={example.key === active.key ? 'default' : 'secondary'}
                className="rounded-full"
                aria-pressed={example.key === active.key}
                onClick={() => setExampleKey(example.key)}
              >
                {example.label}
              </Button>
            ))}
          </div>
        }
        actions={
          <>
            <button type="button" className="wb-action" onClick={() => void onExportAdr()}>
              Export ADR
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
        Changes live only in your browser — the real thing writes{' '}
        <code>.workspec/decisions/*.yaml</code> files in your repo.{' '}
        <span className="demo-blurb">{active.blurb}</span>
      </p>

      <DecisionStudioProvider host={host} theme={theme}>
        <main className="demo-stage" key={`${resetToken}:${active.key}`}>
          <DecisionApp decisionRef={active.decisionRef} />
        </main>
      </DecisionStudioProvider>
    </div>
  );
}
