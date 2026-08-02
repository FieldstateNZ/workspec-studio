import type { CSSProperties, FC, MouseEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type NodeShapeVariant = 'cylinder' | 'hexagon';

interface ShapeFrameProps {
  variant: NodeShapeVariant;
  /** Compiled accent — sets `--el-accent-raw`; CSS derives the rest. */
  accent: string;
  /** Type icon, rendered as the faint corner watermark. */
  icon: LucideIcon;
  width: number;
  height: number;
  selected: boolean;
  active: boolean;
  dimmed: boolean;
  onDoubleClick: (e: MouseEvent) => void;
  children: ReactNode;
}

// Outline shapes for elements whose spec sets `shape: cylinder | hexagon`.
// The silhouette is drawn in SVG (stroke = --el-accent, fill = --el-surface)
// behind the shared node content; box / pill stay in C4NodeComponent. The
// root carries the `c4-el` class so the token layer resolves; content is
// inset below the top geometry so it never overlaps the shape. Ported
// verbatim from the enterprise shapeRenderers.tsx.
export const ShapeFrame: FC<ShapeFrameProps> = ({
  variant,
  accent,
  icon: Icon,
  width: w,
  height: h,
  selected,
  active,
  dimmed,
  onDoubleClick,
  children,
}) => {
  const emphasized = selected || active;
  const strokeWidth = emphasized ? 2.4 : 1.5;
  const glow = selected
    ? 'drop-shadow(0 0 6px color-mix(in oklab, var(--el-accent) 55%, transparent))'
    : undefined;
  const fill = 'var(--el-surface)';
  const stroke = 'var(--el-accent)';

  let silhouette: ReactNode;
  let padTop: number;

  if (variant === 'cylinder') {
    const ry = 11;
    const rx = w / 2 - 4;
    const topCy = ry + 3;
    const botCy = h - ry - 3;
    silhouette = (
      <>
        <path
          d={`M 4 ${String(topCy)} L 4 ${String(botCy)} A ${String(rx)} ${String(ry)} 0 0 0 ${String(w - 4)} ${String(botCy)} L ${String(w - 4)} ${String(topCy)}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <ellipse
          cx={w / 2}
          cy={topCy}
          rx={rx}
          ry={ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </>
    );
    padTop = topCy + ry + 6;
  } else {
    // Flat-top hexagon: a point on each side, the top/bottom edges inset.
    const inset = Math.min(22, w * 0.14);
    const points = [
      `${String(inset)},2`,
      `${String(w - inset)},2`,
      `${String(w - 2)},${String(h / 2)}`,
      `${String(w - inset)},${String(h - 2)}`,
      `${String(inset)},${String(h - 2)}`,
      `2,${String(h / 2)}`,
    ].join(' ');
    silhouette = (
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
    padTop = 12;
  }

  return (
    <div
      className="c4-el"
      onDoubleClick={onDoubleClick}
      style={
        {
          '--el-accent-raw': accent,
          position: 'relative',
          width: w,
          height: h,
          background: 'transparent',
          border: 'none',
          pointerEvents: 'auto',
          filter: dimmed && !emphasized ? 'grayscale(0.7) brightness(0.92)' : undefined,
          transition: 'filter 200ms ease',
        } as CSSProperties
      }
    >
      <svg
        width={w}
        height={h}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          filter: glow,
          transition: 'filter 200ms ease',
        }}
        aria-hidden
      >
        {silhouette}
      </svg>
      <Icon
        aria-hidden
        strokeWidth={1.25}
        style={{
          position: 'absolute',
          right: 6,
          bottom: 2,
          width: 60,
          height: 60,
          color: 'var(--el-watermark)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          paddingTop: padTop,
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 10,
          color: 'var(--el-ink)',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
};
