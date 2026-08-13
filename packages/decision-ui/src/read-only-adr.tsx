import type { ReactElement } from 'react';
import { DecisionAdr } from './adr.js';
import type { DecisionAdrProps } from './adr.js';

export type ReadOnlyAdrProps = DecisionAdrProps;

export function ReadOnlyAdr(props: ReadOnlyAdrProps): ReactElement {
  return <DecisionAdr {...props} />;
}
