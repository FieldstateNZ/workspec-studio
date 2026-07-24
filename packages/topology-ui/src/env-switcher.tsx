// The header's environment segmented control — dev/test/prod (or whatever
// `Topology.spec.environments` declares), ported from the design's env
// button group.

import type { ReactElement } from 'react';

/** Props for {@link EnvSwitcher}. */
export interface EnvSwitcherProps {
  environments: readonly string[];
  value: string;
  onChange: (envSlug: string) => void;
}

export function EnvSwitcher(props: EnvSwitcherProps): ReactElement {
  const { environments, value, onChange } = props;

  return (
    <div className="tp-segmented" role="group" aria-label="Environment">
      {environments.map((envSlug) => (
        <button
          key={envSlug}
          type="button"
          className={envSlug === value ? 'tp-segment tp-segment-active' : 'tp-segment'}
          aria-pressed={envSlug === value}
          onClick={() => onChange(envSlug)}
        >
          {envSlug}
        </button>
      ))}
    </div>
  );
}
