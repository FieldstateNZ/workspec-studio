// The themed root wrapper every independently-mountable trace-ui component
// (`MetersBar`, `RequirementsExplorer`, `FeatureDetail`) renders around
// itself, so each is independently testable and MF-mountable without
// depending on `TraceStudioProvider`. Carries the full WorkSpec token palette
// INLINE via `@workspec/design`'s `themeStyle()` — the same dual-theme-signal
// convention `@workspec/c4-ui`'s `ThemedRoot` uses (`data-aesthetic`/
// `data-theme` for attribute-based CSS, plus the `.dark` class for
// Tailwind's `dark:` variant) — both scoped to this subtree, never the
// document.
//
// One addition over c4-ui's `ThemedRoot`: this establishes `theme` as
// AMBIENT React context. `TraceStudioProvider` renders one `TraceThemedRoot`
// at the top of the tree; `TraceApp` composes `MetersBar` /
// `RequirementsExplorer` / `FeatureDetail` as children WITHOUT threading
// `theme` through every prop by hand — each self-wraps in its own
// `TraceThemedRoot`, which inherits the ambient theme instead of
// re-defaulting to dark when the composing parent (`TraceApp`) didn't pass
// one explicitly. A component rendered fully standalone (a story, a unit
// test, a lone MF expose) still works exactly like c4-ui's `ThemedRoot`:
// pass `theme` explicitly, or accept the `dark` default.
//
// Crucially, that self-wrapping must NOT stack redundant roots. When a
// `TraceThemedRoot` renders under an ancestor one whose theme it would just
// inherit, it emits a plain fragment — no second `.trace-root` div, no
// duplicated inline token map — so the documented
// `<TraceStudioProvider><TraceApp/></TraceStudioProvider>` tree carries
// EXACTLY ONE `.trace-root` even though the provider wraps once and each view
// self-wraps again. A fresh wrapper is emitted only when there is no ambient
// root (standalone mount) or when an explicit `theme` prop DIFFERS from the
// ambient one (a deliberate override that needs its own token map).
import { createContext, useContext } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

const AmbientThemeContext = createContext<ThemeName | null>(null);

/** The nearest ancestor `TraceThemedRoot`'s theme, or `null` outside of one. */
export function useAmbientTheme(): ThemeName | null {
  return useContext(AmbientThemeContext);
}

/** Props for {@link TraceThemedRoot}. */
export interface TraceThemedRootProps {
  /** Explicit theme. Falls back to the ambient theme, then {@link DEFAULT_THEME}. */
  theme?: ThemeName | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function TraceThemedRoot(props: TraceThemedRootProps): ReactElement {
  const ambient = useAmbientTheme();
  const theme = props.theme ?? ambient ?? DEFAULT_THEME;

  // Already inside an ancestor `.trace-root` whose theme this one would just
  // inherit: collapse to a fragment so the composed tree keeps exactly one
  // root with one inline token map. The ambient value already equals `theme`,
  // so descendants keep reading the right theme. Only a standalone mount
  // (no ambient) or an explicit override to a DIFFERENT theme falls through
  // to emit a real wrapper below.
  if (ambient !== null && theme === ambient) {
    return <>{props.children}</>;
  }

  const classes = ['trace-root'];
  if (theme === 'dark') classes.push('dark');
  if (props.className !== undefined && props.className !== '') classes.push(props.className);

  return (
    <AmbientThemeContext.Provider value={theme}>
      <div
        className={classes.join(' ')}
        data-aesthetic="console"
        data-theme={theme}
        style={themeStyle(theme) as CSSProperties}
      >
        {props.children}
      </div>
    </AmbientThemeContext.Provider>
  );
}
