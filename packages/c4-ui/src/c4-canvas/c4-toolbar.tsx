// The floating C4 authoring tools — a port of enterprise's `C4Toolbar.tsx`
// TOOLS group (`components/diagrams/C4Toolbar.tsx:216-275`).
//
// Enterprise renders four absolutely-positioned floating groups as siblings
// of `<Canvas>`: crumb top-LEFT, lens top-CENTRE, PR banner top-centre,
// tools top-RIGHT. This component is the tools group only, because the
// studio already has the other two and they already sit where enterprise
// puts them — the shell's `DiagramCrumb` top-left (#131) and the explorer's
// `.c4-lens-overlay` top-centre. Mounting a second crumb here would
// duplicate chrome the page already carries.
//
// Ported verbatim: the group's fixed height + elevated surface
// (`GROUP_CHROME`, C4Toolbar.tsx:76-77 — one strip height so every floating
// group reads as one system), the 32px square icon buttons, the
// `title === aria-label` rule (C4Toolbar.tsx:88-89), the item ORDER
// (Select · Connect │ palette │ Auto-layout), the `Add ${labelForType(k)}`
// label form, the toggle-off behaviour on an already-armed palette button
// (C4Toolbar.tsx:239), and the fact that Auto-layout never shows an active
// state. Tailwind utilities became the `.c4-tb-*` classes in styles.css
// because this package ships plain CSS over the WorkSpec token set; the
// values they carry are the enterprise ones.
//
// DELIBERATE OMISSION: enterprise's Export dropdown. `onExport` is optional
// there (`C4Toolbar.tsx:26`) and the divider + button are gated on it
// (`:254`), so a host without an export path renders exactly this — the
// studio has no export endpoint, so the group ends at Auto-layout.

import type { FC, ReactNode } from 'react';
import { Box, LayoutDashboard, MousePointer2, Spline } from 'lucide-react';
import { useCanvasSpec, useCanvasStore } from '@workspec/canvas';
import type { ElementKind } from '@workspec/c4-model';
import { iconForKey, labelForType, resolveElementStyle } from '../c4/index.js';

export interface C4ToolbarProps {
  /** The element kinds this diagram can place — see `paletteForDiagram`. */
  palette: readonly ElementKind[];
  /**
   * Runs the host's auto-layout action. Required, and the button is always
   * shown, because enterprise's is (`C4Toolbar.tsx:23` declares
   * `onRelayout` non-optional; `:248` renders it unconditionally) — and
   * because whether a host CAN auto-layout is not knowable at render time:
   * `instance.host` is installed by an effect and is not reactive state.
   * Delegate at call time.
   */
  onRelayout: () => void;
}

interface IconButtonProps {
  /** Used for BOTH `title` and `aria-label` — enterprise's rule, C4Toolbar.tsx:88-89. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}

const IconButton: FC<IconButtonProps> = ({ label, icon, active = false, onClick }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={active ? 'c4-tb-btn c4-tb-btn-active' : 'c4-tb-btn'}
    onClick={onClick}
  >
    {icon}
  </button>
);

const Divider: FC = () => <div className="c4-tb-divider" />;

export const C4Toolbar: FC<C4ToolbarProps> = ({ palette, onRelayout }) => {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const placementNodeType = useCanvasStore((s) => s.placementNodeType);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const setPlacementNodeType = useCanvasStore((s) => s.setPlacementNodeType);
  const spec = useCanvasSpec();

  const startPlacing = (kind: ElementKind): void => {
    setPlacementNodeType(kind);
    setActiveTool('place');
  };

  return (
    // `data-canvas-ui` keeps the engine's pointer pipeline from treating a
    // toolbar click as a canvas gesture (use-pointer-events.ts:110) — the
    // same marker enterprise puts on every floating group.
    <div className="c4-toolbar" data-canvas-ui data-export-exclude>
      <div className="c4-tb-group" role="toolbar" aria-label="C4 tools">
        <IconButton
          label="Select (V)"
          icon={<MousePointer2 size={16} />}
          active={activeTool === 'select'}
          onClick={() => {
            setActiveTool('select');
          }}
        />
        <IconButton
          label="Connect"
          icon={<Spline size={16} />}
          active={activeTool === 'connector'}
          onClick={() => {
            setActiveTool('connector');
          }}
        />
        <Divider />
        {palette.map((kind) => {
          // Icon source = the SAME resolved style the card chrome renders
          // with (host spec override → this package's defaults), so a
          // palette button and the node it drops can never disagree.
          const style = spec.elements[kind] ?? resolveElementStyle(kind, undefined);
          const Icon = iconForKey(style.icon) ?? Box;
          const isPlacing = activeTool === 'place' && placementNodeType === kind;
          return (
            <IconButton
              key={kind}
              label={`Add ${labelForType(kind)}`}
              icon={<Icon size={16} />}
              active={isPlacing}
              onClick={() => {
                // Enterprise's toggle-off: clicking the armed type disarms
                // it back to Select rather than re-arming (C4Toolbar.tsx:239).
                if (isPlacing) setActiveTool('select');
                else startPlacing(kind);
              }}
            />
          );
        })}
        <Divider />
        {/* Never shows an active state — enterprise's does not (C4Toolbar.tsx:248). */}
        <IconButton label="Auto-layout" icon={<LayoutDashboard size={16} />} onClick={onRelayout} />
      </div>
    </div>
  );
};
