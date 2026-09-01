// Exercises the client-side route resolution that stands in for GitHub
// Pages' SPA fallback: since 404.html is a byte-identical copy of index.html
// (see src/build/copy-index-to-not-found.ts), the ONLY thing that turns a
// deep-link 404 into the right page is this router reading the URL the
// browser landed on. If a new deep path resolves to the wrong route here, the
// build-time fallback alone won't save it.
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRoute, type Route } from './router.js';

function RouteProbe(): ReactElement {
  const route = useRoute();
  return <span data-testid="route">{route satisfies Route}</span>;
}

describe('useRoute — exposes only the focused Cost routes', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it.each<[string, Route]>([
    ['/', 'cost'],
    ['/cost', 'cost'],
    ['/cost/', 'cost'],
    ['/cost/demo', 'cost-demo'],
    ['/cost/demo/', 'cost-demo'],
    ['/decisions', 'not-found'],
    ['/decisions/demo', 'not-found'],
    ['/c4', 'not-found'],
    ['/c4/demo', 'not-found'],
    ['/nonexistent', 'not-found'],
  ])('resolves %s to %s', (path, expected) => {
    window.history.pushState({}, '', path);
    render(<RouteProbe />);
    expect(screen.getByTestId('route')).toHaveTextContent(expected);
  });
});
