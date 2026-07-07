// A deliberately tiny path router — two routes, no dependency. Enough for a
// marketing page (`/`) and the demo (`/demo`); GitHub Pages serves the SPA
// fallback (404.html, written at build) so deep links resolve.
import { useCallback, useEffect, useState } from 'react';
import type { AnchorHTMLAttributes, ReactElement } from 'react';

export type Route = 'home' | 'demo';

function routeOf(pathname: string): Route {
  return pathname.replace(/\/+$/, '') === '/demo' ? 'demo' : 'home';
}

/** Current route, kept in sync with browser history (back/forward). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));
  useEffect(() => {
    const sync = (): void => setRoute(routeOf(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return route;
}

/** Client-side navigation without a full reload. */
export function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** An <a> that navigates client-side (falls back to normal nav for modifier-clicks). */
export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement {
  const { href, onClick, ...rest } = props;
  const handle = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>): void => {
      onClick?.(event);
      // Only intercept in-app absolute paths (e.g. "/", "/demo"). Everything
      // else — external URLs, protocol-relative "//host", mailto:/tel:, "#hash"
      // — falls through to the browser's default navigation.
      const isInternal = href !== undefined && href.startsWith('/') && !href.startsWith('//');
      if (
        !isInternal ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigate(href);
    },
    [href, onClick],
  );
  return <a href={href} onClick={handle} {...rest} />;
}
