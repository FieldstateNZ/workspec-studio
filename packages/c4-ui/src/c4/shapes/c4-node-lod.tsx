import type { CSSProperties, FC } from 'react';
import type { C4NodeShape } from '../c4-types.js';
import { labelForType } from '../style/icons.js';
import type { C4DetailLevel } from './c4-detail-level.js';

// The two low-detail C4 card renderings (#134). See `c4-detail-level.ts`
// for the ladder and why it exists. Both keep the `c4-el` class and the
// inline `--el-accent-raw` the full card uses, so the surface / ink /
// border / dark-theme lift all derive through the same token layer
// (`src/c4/index.css`) and both themes are correct for free.
//
// Neither tier renders a description, watermark, footer, status slot or
// any button: at these zooms they are sub-pixel noise, and the buttons are
// far too small to be hit anyway. Accessibility is unaffected — the
// focusable `role="button"` and its `${kind}: ${title}` accessible name
// live on the a11y wrapper in `c4-canvas/a11y-node.tsx`, which wraps this
// component rather than reading its DOM text.

interface Props {
  readonly shape: C4NodeShape;
  /** Which low-detail tier to draw. `'full'` is not handled here. */
  readonly level: Exclude<C4DetailLevel, 'full'>;
  /**
   * The spec-resolved presentation the full card also uses. Passed in
   * rather than re-resolved here so the two renderings cannot drift: the
   * card already did this work through `resolveElementStyle`.
   */
  readonly accent: string;
  readonly nodeShape: string;
  readonly variant: string | null | undefined;
}

/**
 * The C4 card below {@link C4_LOD_TITLE_ZOOM}. `'flat'` is an accent bar
 * with a centred dot (enterprise's exact micro-LOD); `'title'` keeps the
 * card surface and the 4px left accent border that give a C4 card its
 * identity, plus the two things that still read at that size — the type
 * eyebrow and the element name.
 */
export const C4NodeLod: FC<Props> = ({ shape, level, accent, nodeShape, variant }) => {
  const accentVars = { '--el-accent-raw': accent } as CSSProperties;

  if (level === 'flat') {
    return (
      <div
        className="c4-el"
        style={{
          ...accentVars,
          width: shape.width,
          height: shape.height,
          background: 'var(--el-accent)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.85,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            // Enterprise writes this as `rgba(255,255,255,0.9)`. That is a
            // raw colour literal, which this package's token audit rightly
            // forbids — `white` inside `color-mix` is the sanctioned
            // equivalent (same idiom as the `.c4-el` dark accent lift), and
            // renders identically.
            background: 'color-mix(in oklab, white 90%, transparent)',
            flexShrink: 0,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="c4-el"
      data-variant={variant ?? undefined}
      data-shape={nodeShape}
      data-scope={shape.isScope === true ? 'focus' : undefined}
      style={{
        ...accentVars,
        width: shape.width,
        height: shape.height,
        background: 'var(--el-surface)',
        color: 'var(--el-ink)',
        border: '1px solid var(--el-border)',
        borderLeft: '4px solid var(--el-accent)',
        borderLeftStyle: variant === 'external' ? 'dashed' : 'solid',
        borderRadius: nodeShape === 'pill' ? 999 : 10,
        boxShadow: 'var(--sh-2)',
        padding: '10px 12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--el-eyebrow)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {labelForType(shape.nodeType)}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.25,
          color: shape.label ? 'var(--el-ink)' : 'var(--el-ink-dim)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {shape.label || 'Untitled'}
      </div>
    </div>
  );
};
