import { useId, type FC } from 'react';
import { useCanvasStore } from '../canvas-provider.js';

const MINOR = 25;
const MAJOR = 100;

export type BackgroundVariant = 'dots' | 'lines';

interface BackgroundProps {
  variant?: BackgroundVariant;
}

/**
 * Camera-aligned dot/line grid via SVG patterns (minor 25 / major 100
 * world units). Pattern ids are minted with useId — the enterprise fixed
 * ids would collide between two mounted canvases (#118 multi-instance).
 */
export const Background: FC<BackgroundProps> = ({ variant = 'dots' }) => {
  const camera = useCanvasStore((s) => s.camera);
  const uid = useId();
  const minorId = `canvas-minor-${uid}`;
  const majorId = `canvas-major-${uid}`;

  const minorPx = MINOR * camera.zoom;
  const majorPx = MAJOR * camera.zoom;

  // Offset the pattern so grid coordinates align with world-space origin
  const ox = ((-camera.x % MINOR) * camera.zoom + minorPx) % minorPx;
  const oy = ((-camera.y % MINOR) * camera.zoom + minorPx) % minorPx;
  const oxM = ((-camera.x % MAJOR) * camera.zoom + majorPx) % majorPx;
  const oyM = ((-camera.y % MAJOR) * camera.zoom + majorPx) % majorPx;

  return (
    <svg
      data-export-exclude
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        {variant === 'dots' ? (
          <>
            <pattern
              id={minorId}
              x={ox}
              y={oy}
              width={minorPx}
              height={minorPx}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={0} cy={0} r={0.8} fill="var(--canvas-grid-minor)" />
            </pattern>
            <pattern
              id={majorId}
              x={oxM}
              y={oyM}
              width={majorPx}
              height={majorPx}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={0} cy={0} r={1.5} fill="var(--canvas-grid-major)" />
            </pattern>
          </>
        ) : (
          <>
            <pattern
              id={minorId}
              x={ox}
              y={oy}
              width={minorPx}
              height={minorPx}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${String(minorPx)} 0 L 0 0 0 ${String(minorPx)}`}
                fill="none"
                stroke="var(--canvas-grid-minor)"
                strokeWidth={0.5}
              />
            </pattern>
            <pattern
              id={majorId}
              x={oxM}
              y={oyM}
              width={majorPx}
              height={majorPx}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${String(majorPx)} 0 L 0 0 0 ${String(majorPx)}`}
                fill="none"
                stroke="var(--canvas-grid-major)"
                strokeWidth={1}
              />
            </pattern>
          </>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${minorId})`} />
      <rect width="100%" height="100%" fill={`url(#${majorId})`} />
    </svg>
  );
};
