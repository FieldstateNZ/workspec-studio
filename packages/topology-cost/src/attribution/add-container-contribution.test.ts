import { describe, expect, it } from 'vitest';
import { addContainerContribution } from './add-container-contribution.js';

describe('addContainerContribution', () => {
  it('creates a new container entry on first contribution', () => {
    const byContainer = new Map();
    addContainerContribution(byContainer, 'api-server', {
      resourceSlug: 'app-service',
      share: 1,
      monthly: 100,
      unattributedByDefault: false,
    });

    expect(byContainer.get('api-server')).toEqual({
      container: 'api-server',
      monthly: 100,
      unattributedByDefault: false,
      contributions: [
        { resourceSlug: 'app-service', share: 1, monthly: 100, unattributedByDefault: false },
      ],
    });
  });

  it('merges a second contribution into the running total, appending to contributions', () => {
    const byContainer = new Map();
    addContainerContribution(byContainer, 'api-server', {
      resourceSlug: 'app-service',
      share: 1,
      monthly: 100,
      unattributedByDefault: false,
    });
    addContainerContribution(byContainer, 'api-server', {
      resourceSlug: 'sidecar',
      share: 1,
      monthly: 20,
      unattributedByDefault: true,
    });

    const result = byContainer.get('api-server');
    expect(result?.monthly).toBe(120);
    expect(result?.contributions).toHaveLength(2);
  });

  it('sticks unattributedByDefault at true once ANY contribution to the container is default-split', () => {
    const byContainer = new Map();
    addContainerContribution(byContainer, 'api-server', {
      resourceSlug: 'explicit',
      share: 1,
      monthly: 100,
      unattributedByDefault: false,
    });
    addContainerContribution(byContainer, 'api-server', {
      resourceSlug: 'default-split',
      share: 1,
      monthly: 20,
      unattributedByDefault: true,
    });

    expect(byContainer.get('api-server')?.unattributedByDefault).toBe(true);
  });
});
