// The persistent meters bar (spec §5 / §4.7): THREE meters, side by side,
// never collapsed to one number — Scenario coverage, UserReq coverage, and
// Pass rate. The design (`docs/design/Traceability Workbench.dc.html`) shows
// only Coverage + Pass rate; the spec is explicit that the validated 5-kind
// model adds a third, `userReqCoverage` ("are the promises verified?", not
// just "are the scenarios run?") — this component keeps the design's visual
// language (label · track+fill · figure, one row) and adds the third meter
// rather than dropping it to match the mock's two-column screenshot.
import type { ReactElement } from 'react';
import type { TraceModel } from '@workspec/trace-model';
import { formatMeterFraction, formatPercent, formatProofTally, tallyProofs } from './format.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

/** Props for {@link MetersBar}. */
export interface MetersBarProps {
  model: TraceModel;
  theme?: ThemeName | undefined;
  className?: string | undefined;
}

interface MeterEntry {
  key: string;
  label: string;
  meter: TraceModel['scenarioCoverage'];
}

/** The persistent, never-collapsed three-meter bar. */
export function MetersBar(props: MetersBarProps): ReactElement {
  const { model, theme, className } = props;

  const meters: MeterEntry[] = [
    { key: 'scenario-coverage', label: 'Scenario coverage', meter: model.scenarioCoverage },
    { key: 'userreq-coverage', label: 'UserReq coverage', meter: model.userReqCoverage },
    { key: 'pass-rate', label: 'Pass rate', meter: model.passRate },
  ];

  const summary = formatProofTally(tallyProofs(model.scenarios.map((s) => s.proof)));

  return (
    <TraceThemedRoot theme={theme} className={className}>
      <div className="trace-meters" role="group" aria-label="Traceability meters">
        {meters.map((entry) => (
          <div className="trace-meter" key={entry.key}>
            <span className="trace-meter-label">{entry.label}</span>
            <div className="trace-meter-track">
              <div
                className="trace-meter-fill"
                style={{ width: `${Math.min(100, Math.max(0, entry.meter.ratio * 100))}%` }}
              />
            </div>
            <span className="trace-meter-figure">
              {`${formatMeterFraction(entry.meter)} · ${formatPercent(entry.meter)}`}
            </span>
          </div>
        ))}
        <span className="trace-meters-summary">{summary}</span>
      </div>
    </TraceThemedRoot>
  );
}
