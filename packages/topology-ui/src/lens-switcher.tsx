// The header's lens segmented control — Network vs Resource groups, ported
// from the design's lens button group.

import type { ReactElement } from 'react';
import type { LensId } from '@workspec/topology-model';

/** Props for {@link LensSwitcher}. */
export interface LensSwitcherProps {
  value: LensId;
  onChange: (lens: LensId) => void;
}

const LENS_LABEL: Record<LensId, string> = {
  network: 'Network',
  rg: 'Resource groups',
};

export function LensSwitcher(props: LensSwitcherProps): ReactElement {
  const { value, onChange } = props;

  return (
    <div className="tp-segmented" role="group" aria-label="Lens">
      {(['network', 'rg'] as const).map((lens) => (
        <button
          key={lens}
          type="button"
          className={lens === value ? 'tp-segment tp-segment-active' : 'tp-segment'}
          aria-pressed={lens === value}
          onClick={() => onChange(lens)}
        >
          {LENS_LABEL[lens]}
        </button>
      ))}
    </div>
  );
}
