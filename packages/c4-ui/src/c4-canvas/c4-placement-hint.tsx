// The "you are in placement mode" pill — a port of enterprise's placement
// hint (`components/canvas-host/ArchitectureCanvasView.tsx:537-550`): a
// pointer-transparent capsule pinned bottom-centre over the canvas, reading
// `Click to place {type}` · `Esc to cancel`.
//
// It is the ONLY on-screen statement of the Escape precedence this page
// implements (place-mode cancel outranks dismissing the detail rail — see
// `C4Diagram`'s Escape cascade), which is why it is a faithful copy rather
// than a nicety: enterprise leans on the same pill to teach the same key.

import type { FC } from 'react';
import { useCanvasStore } from '@workspec/canvas';
import { labelForType } from '../c4/index.js';

/** Renders nothing unless the place tool is armed with a type. */
export const C4PlacementHint: FC = () => {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const placementNodeType = useCanvasStore((s) => s.placementNodeType);

  if (activeTool !== 'place' || placementNodeType === null) return null;

  return (
    <div className="c4-place-hint" data-canvas-ui data-export-exclude role="status">
      <span>{`Click to place ${labelForType(placementNodeType)}`}</span>
      <span className="c4-place-hint-sep">·</span>
      <span className="c4-place-hint-key">Esc to cancel</span>
    </div>
  );
};
