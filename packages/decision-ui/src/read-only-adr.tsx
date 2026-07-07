// A read-only ADR view: the exact same `DecisionAdr` (one component, no fork)
// rendered with the decide capability forced off, so an embedding host gets a
// review-only architecture decision record without granting — or even
// constructing — the decide flow. This is what the S6 module-federation remote
// exposes as `./AdrView`.

import type { ReactElement } from 'react';
import { DecisionAdr } from './adr.js';
import type { DecisionAdrProps } from './adr.js';
import { HostCapabilitiesProvider } from './context.js';

/** Props for {@link ReadOnlyAdr} — the same shape as {@link DecisionAdr}. */
export type ReadOnlyAdrProps = DecisionAdrProps;

/** {@link DecisionAdr} with `capabilities.decide` forced to `false`. */
export function ReadOnlyAdr(props: ReadOnlyAdrProps): ReactElement {
  return (
    <HostCapabilitiesProvider decide={false}>
      <DecisionAdr {...props} />
    </HostCapabilitiesProvider>
  );
}
