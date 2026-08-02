import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  BringToFront,
  ChevronRight,
  FolderInput,
  FolderMinus,
  Group,
  LayoutGrid,
  Lock,
  LockOpen,
  SendToBack,
  Trash2,
  Ungroup,
  Wand2,
} from 'lucide-react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { useCanvasViewport } from '../canvas-viewport.js';
import { withDescendants } from '../utils/containers.js';
import type { StickyColor, StickyShape, TextShape } from '../shape-types.js';
import type { Shape, ShapeId } from '../types.js';
import { TEXT_COLOR_SWATCHES } from '../style/shape-defaults.js';

// Ported from the enterprise ContextMenu.tsx (#118). Adaptations, all
// logged in the S2 report: bridge calls go to `instance.host`
// (moveToContainer/autoLayout); the hard-coded NON_MOVABLE / groupframe /
// diagram-group / 'c4_boundary' type knowledge became ShapeUtil
// capabilities (isGroupContainer/containerTitle/isContextMenuSurface);
// position clamping uses the canvas rect (seam) instead of window.inner*;
// the danger colour reads the design `--danger` token.

const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple'];

const CANVAS_FONTS: { value: string | undefined; label: string; family: string }[] = [
  { value: undefined, label: 'Sans', family: "'Inter Tight', system-ui, sans-serif" },
  { value: "'Lora', Georgia, serif", label: 'Serif', family: "'Lora', Georgia, serif" },
  { value: "'Caveat', cursive", label: 'Script', family: "'Caveat', cursive" },
];

interface Props {
  x: number;
  y: number;
  ids: ShapeId[];
  onClose: () => void;
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

const MenuItem: FC<MenuItemProps> = ({ icon, label, danger, onClick }) => (
  <button
    onPointerDown={(e) => {
      e.stopPropagation();
      onClick();
    }}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '7px 14px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontSize: 13,
      color: danger ? 'var(--danger)' : 'var(--ink)',
      textAlign: 'left',
      whiteSpace: 'nowrap',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--bg-soft)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
  >
    {icon}
    {label}
  </button>
);

const Divider: FC = () => (
  <div style={{ height: 1, backgroundColor: 'var(--line)', margin: '4px 0' }} />
);

export const ContextMenu: FC<Props> = ({ x, y, ids, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useCanvasInstance();
  const store = useCanvasStore();
  const viewport = useCanvasViewport();
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const shapes = ids.map((id) => store.shapes[id]).filter((s): s is Shape => s !== undefined);
  const firstGroupId = shapes[0]?.groupId;
  const allInSameGroup =
    shapes.length >= 2 && !!firstGroupId && shapes.every((s) => s.groupId === firstGroupId);
  const anyGrouped = shapes.some((s) => !!s.groupId);
  const canGroup = shapes.length >= 2 && !allInSameGroup;
  const canUngroup = anyGrouped;

  // Align & distribute operates on positionable shapes (connectors follow
  // their endpoints, so they're excluded).
  const canAlign = shapes.filter((s) => s.type !== 'connector').length >= 2;

  const utilOf = (s: Shape) => instance.shapeUtils.get(s.type);
  const isContainer = (s: Shape): boolean => utilOf(s)?.isGroupContainer?.(s) === true;
  // Non-movable: connectors follow their endpoints; containers (and
  // pointer-through menu surfaces like the C4 boundary) re-parent via their
  // own containment rules.
  const isMovable = (s: Shape): boolean =>
    s.type !== 'connector' && !isContainer(s) && utilOf(s)?.isContextMenuSurface?.(s) !== true;

  // "Move to group" targets: every group container on the canvas, minus any
  // inside the selection's own containment subtree (re-parenting into your own
  // descendant would create a cycle).
  const allMovable = shapes.length > 0 && shapes.every(isMovable);
  const selectionSubtree = allMovable
    ? new Set(withDescendants(store.shapes, ids))
    : new Set<ShapeId>();
  const groupTargets = allMovable
    ? Object.values(store.shapes).filter((s) => isContainer(s) && !selectionSubtree.has(s.id))
    : [];
  const showMoveToGroup = groupTargets.length > 0;
  const anyContained = shapes.some((s) => !!s.containerId);

  const moveSelectionToContainer = (containerId: string | null): void => {
    if (instance.host.moveToContainer?.(ids, containerId) !== true) {
      const prev = new Map<ShapeId, string | undefined>();
      for (const id of ids) {
        const s = store.shapes[id];
        if (s) prev.set(id, s.containerId);
      }
      store._executeCommand({
        label: containerId !== null ? 'Move to group' : 'Remove from group',
        do: (s) => {
          const next = { ...s };
          for (const id of prev.keys()) {
            const shape = next[id];
            if (shape) next[id] = { ...shape, containerId: containerId ?? undefined };
          }
          return next;
        },
        undo: (s) => {
          const next = { ...s };
          for (const id of prev.keys()) {
            const shape = next[id];
            if (shape) next[id] = { ...shape, containerId: prev.get(id) };
          }
          return next;
        },
      });
    }
    onClose();
  };

  // Container-level: auto-arrange the contents of the active boundary panel.
  // Available whenever a context-menu-surface shape (the C4 boundary) is on
  // the canvas and the host wired an autoLayout handler — independent of the
  // right-clicked shape. (Enterprise gated on the literal 'c4_boundary'
  // shape id; the capability replaces it, #118.)
  const autoLayout = instance.host.autoLayout;
  const canAutoLayout =
    autoLayout !== undefined &&
    Object.values(store.shapes).some((s) => utilOf(s)?.isContextMenuSurface?.(s) === true);

  const stickies = shapes.filter((s): s is StickyShape => s.type === 'sticky');
  const allStickies = stickies.length === shapes.length && shapes.length > 0;
  const firstSticky = stickies[0];
  const activeStickyColor =
    allStickies && firstSticky !== undefined && stickies.every((s) => s.color === firstSticky.color)
      ? firstSticky.color
      : null;

  const texts = shapes.filter((s): s is TextShape => s.type === 'text');
  const allTexts = texts.length === shapes.length && shapes.length > 0;
  const firstText = texts[0];
  const activeTextColor =
    allTexts && firstText !== undefined && texts.every((s) => s.color === firstText.color)
      ? (firstText.color ?? 'var(--ink)')
      : null;
  const activeTextSize =
    allTexts && firstText !== undefined && texts.every((s) => s.fontSize === firstText.fontSize)
      ? firstText.fontSize
      : null;
  const textWidthLocked = allTexts && texts.some((s) => s.lockWidth === true);
  const textHeightLocked = allTexts && texts.some((s) => s.lockHeight === true);

  const fontCapable = shapes.filter(
    (s): s is StickyShape | TextShape => s.type === 'sticky' || s.type === 'text',
  );
  const allFontCapable = fontCapable.length === shapes.length && shapes.length > 0;
  const firstFontCapable = fontCapable[0];
  const activeFontFamily =
    allFontCapable &&
    firstFontCapable !== undefined &&
    fontCapable.every((s) => s.fontFamily === firstFontCapable.fontFamily)
      ? firstFontCapable.fontFamily // undefined = default sans
      : null; // mixed — no active state

  const MENU_WIDTH = 200;
  const estimatedHeight =
    (allFontCapable ? 42 : 0) +
    (allStickies || allTexts ? 42 : 0) +
    148 +
    (canGroup || canUngroup ? 36 : 0) +
    (canAlign ? 36 : 0) +
    (showMoveToGroup ? 36 : 0) +
    36;
  // Clamp within the canvas rect (the seam) — the enterprise full-window
  // canvas clamped against window.inner*, which is the same rect there.
  const rect = viewport?.getRect() ?? null;
  const maxRight = rect ? rect.right : x + MENU_WIDTH + 8;
  const maxBottom = rect ? rect.bottom : y + estimatedHeight + 8;
  const left = Math.min(x, maxRight - MENU_WIDTH - 8);
  const top = Math.min(y, maxBottom - estimatedHeight - 8);
  const submenuOnLeft = left + MENU_WIDTH + 200 > maxRight;

  const run = (action: () => void): void => {
    action();
    onClose();
  };

  return (
    <div
      ref={ref}
      data-canvas-ui
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        boxShadow: 'var(--sh-3)',
        padding: '4px 0',
        minWidth: MENU_WIDTH,
        pointerEvents: 'auto',
      }}
    >
      {allFontCapable && (
        <>
          <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {CANVAS_FONTS.map(({ value, label, family }) => {
              const isActive = activeFontFamily === value;
              return (
                <button
                  key={label}
                  title={label}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    fontCapable.forEach((s) => {
                      store.updateShape(s.id, { fontFamily: value });
                    });
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 'var(--r-2)',
                    border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-soft)',
                    color: isActive ? 'var(--accent)' : 'var(--ink)',
                    cursor: 'pointer',
                    fontFamily: family,
                    fontSize: 14,
                    padding: 0,
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 80ms, background-color 80ms',
                  }}
                >
                  Aa
                </button>
              );
            })}
          </div>
          <Divider />
        </>
      )}
      {allStickies && (
        <>
          <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {STICKY_COLORS.map((color) => (
              <button
                key={color}
                title={color}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  stickies.forEach((s) => {
                    store.updateShape(s.id, { color });
                  });
                  onClose();
                }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: `var(--sticky-${color}-bg)`,
                  border:
                    activeStickyColor === color
                      ? '2.5px solid var(--ink)'
                      : `1px solid var(--sticky-${color}-edge)`,
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  outline: 'none',
                  transform: activeStickyColor === color ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform 80ms ease-out',
                }}
              />
            ))}
          </div>
          <Divider />
        </>
      )}
      {allTexts && (
        <>
          <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {TEXT_COLOR_SWATCHES.map(({ value, label }) => {
              const swatch = value ?? 'var(--ink)';
              const isActive = activeTextColor === swatch;
              return (
                <button
                  key={label}
                  title={label}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    texts.forEach((s) => {
                      store.updateShape(s.id, { color: value });
                    });
                    onClose();
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: swatch,
                    border: isActive ? '2.5px solid var(--ink)' : '1px solid var(--line)',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                    outline: 'none',
                    transform: isActive ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 80ms ease-out',
                  }}
                />
              );
            })}
          </div>
          <div
            style={{ padding: '2px 14px 8px' }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>Size</span>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                {activeTextSize !== null ? `${String(activeTextSize)}px` : '–'}
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={128}
              step={1}
              value={activeTextSize ?? firstText?.fontSize ?? 16}
              onChange={(e) => {
                const size = Number(e.target.value);
                texts.forEach((s) => {
                  store.updateShape(s.id, { fontSize: size });
                });
              }}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
          <div style={{ padding: '2px 14px 6px', display: 'flex', gap: 6 }}>
            {(
              [
                {
                  label: 'Width',
                  locked: textWidthLocked,
                  icon: <ArrowLeftRight size={12} />,
                  key: 'lockWidth',
                },
                {
                  label: 'Height',
                  locked: textHeightLocked,
                  icon: <ArrowUpDown size={12} />,
                  key: 'lockHeight',
                },
              ] as const
            ).map(({ label, locked, icon, key }) => (
              <button
                key={key}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  texts.forEach((s) => {
                    store.updateShape(s.id, { [key]: !locked });
                  });
                  onClose();
                }}
                style={{
                  flex: 1,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  borderRadius: 'var(--r-2)',
                  border: locked ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                  backgroundColor: locked ? 'var(--accent-soft)' : 'var(--bg-soft)',
                  color: locked ? 'var(--accent)' : 'var(--ink-soft)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: 0,
                  outline: 'none',
                  transition: 'border-color 80ms, background-color 80ms',
                }}
              >
                {locked ? <Lock size={11} /> : <LockOpen size={11} />}
                {icon}
                {label}
              </button>
            ))}
          </div>
          <Divider />
        </>
      )}
      {canAlign && (
        <>
          <MenuItem
            icon={<LayoutGrid size={14} />}
            label="Align & distribute"
            onClick={() => {
              run(() => {
                store.alignDistribute(ids);
              });
            }}
          />
          <Divider />
        </>
      )}
      {canAutoLayout && (
        <>
          <MenuItem
            icon={<Wand2 size={14} />}
            label="Auto-layout contents"
            onClick={() => {
              run(() => {
                autoLayout();
              });
            }}
          />
          {ids.length > 0 && <Divider />}
        </>
      )}
      {ids.length > 0 && (
        <>
          <MenuItem
            icon={<BringToFront size={14} />}
            label="Bring to Front"
            onClick={() => {
              run(() => {
                store.bringToFront(ids);
              });
            }}
          />
          <MenuItem
            icon={<ArrowUp size={14} />}
            label="Bring Forward"
            onClick={() => {
              run(() => {
                store.bringForward(ids);
              });
            }}
          />
          <MenuItem
            icon={<ArrowDown size={14} />}
            label="Send Backward"
            onClick={() => {
              run(() => {
                store.sendBackward(ids);
              });
            }}
          />
          <MenuItem
            icon={<SendToBack size={14} />}
            label="Send to Back"
            onClick={() => {
              run(() => {
                store.sendToBack(ids);
              });
            }}
          />
          {(canGroup || canUngroup || showMoveToGroup) && <Divider />}
          {canGroup && (
            <MenuItem
              icon={<Group size={14} />}
              label="Group"
              onClick={() => {
                run(() => {
                  store.groupShapes(ids);
                });
              }}
            />
          )}
          {canUngroup && (
            <MenuItem
              icon={<Ungroup size={14} />}
              label="Ungroup"
              onClick={() => {
                run(() => {
                  store.ungroupShapes(ids);
                });
              }}
            />
          )}
          {showMoveToGroup && (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => {
                setMoveSubmenuOpen(true);
              }}
              onMouseLeave={() => {
                setMoveSubmenuOpen(false);
              }}
            >
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setMoveSubmenuOpen((v) => !v);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 14px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--ink)',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  backgroundColor: moveSubmenuOpen ? 'var(--bg-soft)' : 'transparent',
                }}
              >
                <FolderInput size={14} />
                Move to group
                <ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }} />
              </button>
              {moveSubmenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: -5,
                    left: submenuOnLeft ? undefined : '100%',
                    right: submenuOnLeft ? '100%' : undefined,
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    boxShadow: 'var(--sh-3)',
                    padding: '4px 0',
                    minWidth: 160,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {groupTargets.map((g) => (
                    <MenuItem
                      key={g.id}
                      icon={<Group size={14} />}
                      label={utilOf(g)?.containerTitle?.(g) ?? g.type}
                      onClick={() => {
                        moveSelectionToContainer(g.id);
                      }}
                    />
                  ))}
                  {anyContained && (
                    <>
                      <Divider />
                      <MenuItem
                        icon={<FolderMinus size={14} />}
                        label="Remove from group"
                        onClick={() => {
                          moveSelectionToContainer(null);
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <Divider />
          <MenuItem
            icon={<Trash2 size={14} />}
            label="Delete"
            danger
            onClick={() => {
              run(() => {
                store.deleteShapes(ids);
              });
            }}
          />
        </>
      )}
    </div>
  );
};
