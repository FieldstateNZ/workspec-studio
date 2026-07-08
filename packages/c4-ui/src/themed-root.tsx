// The themed root wrapper every top-level exposed component (`C4Diagram`,
// `C4Explorer`) renders around itself, so each is independently mountable
// (standalone, embedded, or as its own module-federation expose) without
// depending on a shared context provider. Carries the full WorkSpec token
// palette INLINE via `@workspec/design`'s `themeStyle()` — the same
// dual-theme-signal convention packages/decision-ui's `DecisionStudioProvider`
// uses (see @workspec/design docs/theming.md): the `data-aesthetic`/
// `data-theme` attribute pair activates the token palette for
// attribute-based CSS, and the `.dark` class activates Tailwind's `dark:`
// variant for the adopted @workspec/design components — both scoped to this
// subtree, never the document.
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

export function ThemedRoot(props: {
  theme?: ThemeName | undefined;
  className?: string | undefined;
  children: ReactNode;
}): ReactElement {
  const theme = props.theme ?? DEFAULT_THEME;
  const classes = ['c4-root'];
  if (theme === 'dark') classes.push('dark');
  if (props.className !== undefined && props.className !== '') classes.push(props.className);

  return (
    <div
      className={classes.join(' ')}
      data-aesthetic="console"
      data-theme={theme}
      style={themeStyle(theme) as CSSProperties}
    >
      {props.children}
    </div>
  );
}
