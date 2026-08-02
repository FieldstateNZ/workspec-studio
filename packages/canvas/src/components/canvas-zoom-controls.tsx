import type { CSSProperties, FC, ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useCamera } from '../hooks/use-camera.js';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { useCanvasViewport } from '../canvas-viewport.js';

/**
 * Zoom in / out / 100% / fit-view — a vertical segmented control docked to
 * the canvas. Reads the enclosing Canvas's measured viewport, so zoom
 * centres on the canvas middle and fit frames within the canvas (this was
 * the enterprise's `getRect` prop — the pattern the whole port
 * generalized; the window fallback is gone, no measurable rect = no-op).
 * The enterprise Tailwind app-theme classes became inline design-token
 * styles (deviation logged).
 */
const BTN_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  color: 'var(--ink-muted)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: 'color 150ms ease, background-color 150ms ease',
};

const ZoomButton: FC<{
  onClick: () => void;
  title: string;
  withDivider?: boolean;
  extraStyle?: CSSProperties;
  children: ReactNode;
}> = ({ onClick, title, withDivider, extraStyle, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    style={{
      ...BTN_STYLE,
      ...(withDivider ? { borderTop: '1px solid var(--line)' } : {}),
      ...extraStyle,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.color = 'var(--ink)';
      e.currentTarget.style.backgroundColor = 'var(--bg-soft)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.color = 'var(--ink-muted)';
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
  >
    {children}
  </button>
);

export const CanvasZoomControls: FC = () => {
  const instance = useCanvasInstance();
  const { zoomByFactor, zoomToFit } = useCamera();
  const zoom = useCanvasStore((s) => s.camera.zoom);
  const viewport = useCanvasViewport();

  const centre = (): { x: number; y: number } | null => {
    if (!viewport || viewport.width === 0 || viewport.height === 0) return null;
    return { x: viewport.width / 2, y: viewport.height / 2 };
  };

  const resetToHundredPercent = (): void => {
    const c = centre();
    if (!c) return;
    const { camera } = instance.getState();
    // World point currently under the canvas centre — keep it fixed as we jump to zoom=1.
    const wx = c.x / camera.zoom + camera.x;
    const wy = c.y / camera.zoom + camera.y;
    instance.getState().setCamera({ x: wx - c.x, y: wy - c.y, zoom: 1 });
    instance.getState().setViewportIntent('reset');
  };

  return (
    <div
      data-canvas-ui
      data-export-exclude
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'color-mix(in oklab, var(--bg) 95%, transparent)',
        backdropFilter: 'blur(4px)',
        boxShadow: 'var(--sh-3)',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <ZoomButton
        title="Zoom in"
        onClick={() => {
          const c = centre();
          if (c) zoomByFactor(1.25, c.x, c.y);
        }}
      >
        <Plus size={16} />
      </ZoomButton>
      <ZoomButton
        title="Reset zoom to 100%"
        withDivider
        extraStyle={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
        onClick={resetToHundredPercent}
      >
        {`${String(Math.round(zoom * 100))}%`}
      </ZoomButton>
      <ZoomButton
        title="Zoom out"
        withDivider
        onClick={() => {
          const c = centre();
          if (c) zoomByFactor(0.8, c.x, c.y);
        }}
      >
        <Minus size={16} />
      </ZoomButton>
      <ZoomButton
        title="Fit view"
        withDivider
        onClick={() => {
          zoomToFit();
        }}
      >
        <Maximize size={16} />
      </ZoomButton>
    </div>
  );
};
