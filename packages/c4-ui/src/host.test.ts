import { describe, expect, it } from 'vitest';
import { createInertLinkResolver } from './host.js';
import type { LinkTarget } from './host.js';

describe('createInertLinkResolver', () => {
  it('resolves nothing — every link stays a label', () => {
    const resolve = createInertLinkResolver();
    const link: LinkTarget = {
      kind: 'adr',
      label: 'README.md',
      target: '~/docs/architecture/README.md',
    };
    expect(resolve(link)).toEqual({ resolved: false });
  });
});
