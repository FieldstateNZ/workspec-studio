import { describe, expect, it } from 'vitest';
import { armLocalName } from './arm-local-name.js';

describe('armLocalName', () => {
  it('returns the leaf segment of a parent-qualified nested resource name', () => {
    expect(armLocalName('core-vnet/snet-workload')).toBe('snet-workload');
  });

  it('returns the input unchanged when not slash-qualified', () => {
    expect(armLocalName('web-app')).toBe('web-app');
  });
});
