// The C4-specific rows injected into the shared canvas `ContextMenu`
// (its `extraItems` slot).
//
// Everything ELSE on the C4 menu — `Auto-layout contents`, the z-order
// block, Group/Ungroup, `Move to group`, the danger `Delete` — is composed
// by the shared menu itself from store state and ShapeUtil capabilities,
// which is exactly what enterprise's C4 canvas shows (its menu IS the
// generic `canvas/components/ContextMenu.tsx`; `components/project/
// CanvasContextMenu.tsx` is dead code that nothing renders). So mounting
// the shared menu unmodified IS the parity move, and this file adds the one
// row enterprise reaches by a different route.
//
// That row is RENAME. Enterprise renames a C4 element through the element
// editor dialog it opens on double-click, and renames an edge through the
// select tool's double-click-to-edit branch — neither is a menu item there.
// The studio needs a menu row because #133 makes "rename via context menu"
// an acceptance gesture. It is additive, not a substitution: the
// double-click routes still work, and no enterprise row moved to make space
// (the slot renders above the menu's first composed block).
//
// Both targets funnel through the SAME mechanism the double-click routes
// use — `setEditing(shapeId)` — so the row cannot drift from them:
//   - a c4node → `C4NodeComponent`'s inline `LabelEditor` → on commit,
//     `C4CanvasHost.renameNode` (PATCH the element's title).
//   - a connector → `ConnectorLayer`'s `EdgeLabelEditor` → on commit,
//     `CanvasHost.renameEdge` (PATCH the relation's label).

import type { FC } from 'react';
import { Pencil } from 'lucide-react';
import { ContextMenuDivider, ContextMenuItem, useCanvasStore } from '@workspec/canvas';
import type { ShapeId } from '@workspec/canvas';
import type { C4NodeMeta } from '../c4/index.js';

export interface C4ContextMenuExtrasProps {
  /** The right-clicked selection, as the shared menu resolved it. */
  ids: readonly ShapeId[];
  /** Dismiss the menu — call after running an action. */
  onClose: () => void;
}

export const C4ContextMenuExtras: FC<C4ContextMenuExtrasProps> = ({ ids, onClose }) => {
  const shapes = useCanvasStore((s) => s.shapes);
  const setEditing = useCanvasStore((s) => s.setEditing);

  // Renaming edits ONE thing, so it only offers itself for a single
  // selection — a bulk rename has no meaning.
  const only = ids.length === 1 ? ids[0] : undefined;
  const shape = only !== undefined ? shapes[only] : undefined;
  if (only === undefined || shape === undefined) return null;

  // A pending card is already sitting in its inline editor, and an
  // injected/dangling node has no element file behind it to rename.
  if (shape.type === 'c4node') {
    const meta = (shape.meta ?? {}) as C4NodeMeta;
    if (meta.pending === true || meta.injected === true || meta.dangling === true) return null;
  } else if (shape.type !== 'connector') {
    return null;
  }

  return (
    <>
      <ContextMenuItem
        icon={<Pencil size={14} />}
        label="Rename"
        onClick={() => {
          setEditing(only);
          onClose();
        }}
      />
      <ContextMenuDivider />
    </>
  );
};
