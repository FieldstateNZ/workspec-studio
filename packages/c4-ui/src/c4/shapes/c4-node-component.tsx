import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ArrowUpRight, Box, CircleAlert, CircleCheck, ScanSearch } from 'lucide-react';
import {
  useCanvasHover,
  useCanvasInstance,
  useCanvasSpec,
  useCanvasStore,
  type Shape,
  type ShapeId,
} from '@workspec/canvas';
import type { C4NodeMeta, C4NodeShape, C4ValidationError } from '../c4-types.js';
import { getC4Host } from '../c4-types.js';
import { resolveElementStyle } from '../style/spec-defaults.js';
import { iconForKey, labelForType } from '../style/icons.js';
import { REWORKING_COLOUR, REWORKING_HALO_BG, VALID_GREEN } from '../style/status-colors.js';
import { ShapeFrame } from './shape-renderers.js';
import { useC4NodeStatus } from '../node-status-slot.js';

// The C4 node card — THE visual parity target (#119): badged cards with
// kind-coloured accents, exact enterprise typography/spacing. Ported from
// the enterprise C4NodeComponent.tsx with the three S3 injections:
// no wouter (navigation goes through the host bridge / status slot), the
// PR-overlay block replaced by the C4NodeStatusSlot render prop, and the
// accent/icon fallback chain resolved through style/spec-defaults.ts's
// design-token entries instead of the NODE_TYPE_COLOURS literals (the
// ratified studio deviation — same rendered hues). Enterprise Tailwind
// utility classes became inline token styles + the wsc-c4-* helper classes
// (index.css), byte-matching the rendered metrics.

interface Props {
  shape: C4NodeShape;
  isEditing: boolean;
}

const LabelEditor: FC<{
  initial: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}> = ({ initial, placeholder, onCommit, onCancel }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(initial);
  const cancelledRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      data-canvas-ui
      value={val}
      placeholder={placeholder}
      onChange={(e) => {
        setVal(e.target.value);
      }}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          onCancel();
        } else {
          onCommit(val);
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === 'Escape') {
          cancelledRef.current = true;
          ref.current?.blur();
        }
      }}
      style={{
        width: '100%',
        background: 'transparent',
        outline: 'none',
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.25,
        color: 'var(--ink)',
        border: '1px solid var(--accent)',
        borderRadius: 4,
        padding: '1px 4px',
      }}
    />
  );
};

/** Small icon button chrome shared by the drill/validity controls. */
const ICON_BTN: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
};

const CHIP: CSSProperties = {
  fontSize: 8,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '1px 4px',
  // Tailwind v4 `rounded-sm` resolves --radius-sm → var(--r-2) = 4px in the
  // enterprise token set (NOT v3's 2px) — reviewer-verified (#119).
  borderRadius: 4,
  flexShrink: 0,
};

export const C4NodeComponent: FC<Props> = ({ shape, isEditing }) => {
  const instance = useCanvasInstance();
  const canvasHost = getC4Host(instance);
  const updateShape = useCanvasStore((s) => s.updateShape);
  const setEditing = useCanvasStore((s) => s.setEditing);
  const renderStatus = useC4NodeStatus();

  const spec = useCanvasSpec();
  const specStyle = spec.elements[shape.nodeType];
  // Identity (authored) → the compiled accent. Legibility — surface, ink,
  // border, dark lift — is derived from it in CSS (the `.c4-el` token layer
  // in index.css), with text always on a neutral surface, so contrast is
  // free. Fallback chain: host CanvasSpec → the reconciled design-token
  // defaults (style/spec-defaults.ts).
  const defaults = resolveElementStyle(shape.nodeType, undefined);
  const accent = specStyle?.accent ?? defaults.accent;
  const Icon = iconForKey(specStyle?.icon) ?? iconForKey(defaults.icon) ?? Box;
  const nodeShape = specStyle?.shape ?? defaults.shape;
  const nodeVariant = specStyle?.variant !== undefined ? specStyle.variant : defaults.variant;
  const isOutlineShape = nodeShape === 'cylinder' || nodeShape === 'hexagon';

  // Active when this node is hovered directly, or when a connector incident
  // to it is hovered — mirrors the connectors lighting up the nodes they join.
  const hoveredId = useCanvasHover((s) => s.hoveredId);
  const active = useMemo(() => {
    if (hoveredId === null) return false;
    if (hoveredId === shape.id) return true;
    const h: Shape | undefined = instance.getState().shapes[hoveredId];
    return (
      h?.type === 'connector' &&
      (h['sourceShapeId'] === shape.id || h['targetShapeId'] === shape.id)
    );
  }, [hoveredId, shape.id, instance]);

  // Selected nodes wear the same accent border as the hover state — the
  // SelectionLayer deliberately skips c4 nodes (selfRendersSelection) so
  // this is the only indicator.
  const selected = useCanvasStore((s) => s.selectedIds.has(shape.id));

  const meta = (shape.meta ?? {}) as C4NodeMeta;
  // A pending node hasn't persisted yet — it only exists locally until named.
  const isPending = meta.pending === true;
  // The spotlight flag (host-settable; see C4NodeMeta docs).
  const dimmed = meta.dimmed === true;
  // Git-native "pencil" state: dashed DRAFT chip.
  const drafted = shape.drafted === true && !isPending;
  const validationErrors: C4ValidationError[] = meta.validationErrors ?? [];
  const artifactRefId = meta.artifactRefId ?? null;

  const cancel = (): void => {
    setEditing(null);
    if (isPending) {
      // Never-persisted node — discard it locally (no server call).
      const store = instance.getState();
      const next: Record<ShapeId, Shape> = {};
      for (const [key, value] of Object.entries(store.shapes)) {
        if (key !== shape.id) next[key as ShapeId] = value;
      }
      store._setShapesRaw(next);
    }
  };

  const commit = (text: string): void => {
    const name = text.trim();
    if (!name) {
      cancel();
      return;
    }
    if (isPending) {
      // First name → persist. The slugified name becomes the id/filename.
      updateShape(shape.id, { label: name });
      setEditing(null);
      getC4Host(instance).commitNewNode?.(shape.nodeType, name, { x: shape.x, y: shape.y });
    } else {
      if (name !== shape.label) {
        updateShape(shape.id, { label: name });
        getC4Host(instance).renameNode?.(shape.slug, name);
      }
      setEditing(null);
    }
  };

  // Open the element editor (name + description) for this node's artifact.
  // Triggered by the validity marker and by double-clicking the card.
  // (Enterprise dispatched a window CustomEvent; the host callback replaces
  // it — declared deviation, #119.)
  const openEditor = (): void => {
    if (artifactRefId === null) return; // orphan node — no artifact to edit
    getC4Host(instance).openElementEditor?.({
      artifactRefId,
      slug: shape.slug,
      label: shape.label,
      description: shape.description ?? '',
      validationErrors,
    });
  };

  const handleDoubleClick = (e: MouseEvent): void => {
    // Pending nodes use the inline name editor; named nodes open the element
    // editor (rename + description) instead of inline rename.
    if (isPending || isEditing) return;
    e.stopPropagation();
    openEditor();
  };

  // Shared node content (type label + draft chip + status slot + drill /
  // validity buttons + name/editor + description). Identical across shape
  // variants — each frame supplies its own padding chrome.
  const content: ReactNode = (
    <>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--el-eyebrow)',
            }}
          >
            {labelForType(shape.nodeType)}
          </span>
          {drafted && (
            <span
              style={{
                ...CHIP,
                color: 'var(--el-ink-dim)',
                border: '1px dashed var(--el-ink-dim)',
              }}
              title="Uncommitted changes on your draft branch"
            >
              Draft
            </span>
          )}
          {renderStatus(shape)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {shape.drillable === true && canvasHost.enterRoom !== undefined && (
            <button
              type="button"
              data-canvas-ui
              className="wsc-c4-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                getC4Host(instance).enterRoom?.(shape.slug, shape.label, shape.nodeType);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: accent,
              }}
              title="Enter architecture room"
              aria-label="Enter architecture room"
            >
              ROOM <ArrowUpRight size={10} strokeWidth={2.5} />
            </button>
          )}
          {shape.drillable === true && canvasHost.drillDown !== undefined && (
            <button
              type="button"
              data-canvas-ui
              className="wsc-c4-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                getC4Host(instance).drillDown?.(shape.slug);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              style={{ ...ICON_BTN, color: 'var(--el-ink-dim)' }}
              title="Drill into this"
              aria-label="Drill into this"
            >
              <ScanSearch size={14} strokeWidth={2} />
            </button>
          )}
          {/* Validity marker — green check when the artifact's YAML validates,
              red alert when it has schema issues. Hidden for pending (unnamed)
              nodes and for nodes with no artifact meta at all. */}
          {!isPending &&
            artifactRefId !== null &&
            (validationErrors.length > 0 ? (
              <button
                type="button"
                data-canvas-ui
                className="wsc-c4-icon-btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                style={{ ...ICON_BTN, color: 'var(--danger)' }}
                title="Missing information — click to edit"
                aria-label="Missing information — click to edit"
              >
                <CircleAlert size={14} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                data-canvas-ui
                className="wsc-c4-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                style={{ ...ICON_BTN, color: VALID_GREEN }}
                title="Valid — click to edit"
                aria-label="Valid — click to edit"
              >
                <CircleCheck size={14} strokeWidth={2} />
              </button>
            ))}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {isEditing ? (
          <LabelEditor
            initial={shape.label}
            placeholder={`Name this ${labelForType(shape.nodeType).toLowerCase()}…`}
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.25,
              color: shape.label ? 'var(--el-ink)' : 'var(--el-ink-dim)',
            }}
          >
            {shape.label || 'Untitled'}
          </div>
        )}
      </div>
      {shape.description !== undefined && shape.description !== '' && !isEditing && (
        <div
          className="wsc-c4-clamp2"
          style={{ marginTop: 4, fontSize: 12, lineHeight: 1.625, color: 'var(--el-ink-dim)' }}
        >
          {shape.description}
        </div>
      )}
    </>
  );

  if (isOutlineShape) {
    return (
      <ShapeFrame
        variant={nodeShape}
        accent={accent}
        icon={Icon}
        width={shape.width}
        height={shape.height}
        selected={selected}
        active={active}
        dimmed={dimmed}
        onDoubleClick={handleDoubleClick}
      >
        {content}
      </ShapeFrame>
    );
  }

  // Box / pill card. The accent is a 4px left border + the icon watermark —
  // never the fill. Surface / ink / border come from the `.c4-el` token
  // layer, so text contrast is guaranteed in both themes for any accent.
  // `external` variant dashes the accent border.
  //
  // The reworking halo is a sibling div OUTSIDE the overflow-hidden card so
  // the −16 px inset ring isn't clipped by the card boundary.
  const reworking = shape.reworking === true && !isPending;
  const canvasObjectId = shape.canvasObjectId ?? null;
  const card = (
    <div
      className="c4-el"
      data-variant={nodeVariant ?? undefined}
      data-shape={nodeShape}
      data-scope={shape.isScope === true ? 'focus' : undefined}
      onDoubleClick={handleDoubleClick}
      style={
        {
          '--el-accent-raw': accent,
          position: 'relative',
          overflow: 'hidden',
          width: shape.width,
          height: shape.height,
          background: 'var(--el-surface)',
          color: 'var(--el-ink)',
          border: '1px solid var(--el-border)',
          borderLeft: '4px solid var(--el-accent)',
          borderLeftStyle: nodeVariant === 'external' ? 'dashed' : 'solid',
          borderRadius: nodeShape === 'pill' ? 999 : 10,
          // Selected → solid accent ring + glow. Hover (when not selected) →
          // a dashed accent outline, so the two states read differently.
          boxShadow: selected
            ? '0 0 0 2px var(--el-accent), 0 6px 20px color-mix(in oklab, var(--el-accent) 30%, transparent)'
            : 'var(--sh-2)',
          outline: active && !selected ? '2px dashed var(--el-accent)' : undefined,
          outlineOffset: active && !selected ? '2px' : undefined,
          filter: dimmed && !selected && !active ? 'grayscale(0.7) brightness(0.92)' : undefined,
          transition: 'box-shadow 200ms ease, filter 200ms ease',
          // The Shape wrapper sets pointer-events:none on non-editing shapes
          // so the canvas can hit-test/drag them. Re-enable it on the C4 card
          // so its interactive children receive clicks; dragging still works
          // because pointerdown bubbles to the canvas.
          pointerEvents: 'auto',
        } as CSSProperties
      }
    >
      {/* Corner watermark — the type icon, big and faint, bleeding off the
          bottom-right and clipped by the card's overflow-hidden. */}
      <Icon
        aria-hidden
        strokeWidth={1.25}
        style={{
          position: 'absolute',
          right: -12,
          bottom: -14,
          width: 88,
          height: 88,
          color: 'var(--el-watermark)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', padding: '10px 12px', zIndex: 1 }}>{content}</div>
      {!drafted && !isPending && canvasObjectId !== null && (
        <div
          data-canvas-ui
          style={{
            borderTop: '1px solid var(--el-border)',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 600,
              textTransform: 'uppercase',
              fontSize: 8.5,
              letterSpacing: '0.12em',
              color: reworking ? REWORKING_COLOUR : 'var(--el-ink-dim)',
            }}
          >
            {reworking ? '● Reworking' : '○ Inked'}
          </span>
          <button
            type="button"
            data-canvas-ui
            className="wsc-c4-fade-btn"
            onClick={(e) => {
              e.stopPropagation();
              getC4Host(instance).toggleReworking?.(canvasObjectId, shape.reworking === true);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: 'var(--el-ink-dim)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
            }}
            title={reworking ? 'Mark as inked' : 'Flag for reworking'}
          >
            {reworking ? 'Clear' : 'Flag'}
          </button>
        </div>
      )}
    </div>
  );

  if (!reworking) return card;

  return (
    <div style={{ position: 'relative' }}>
      {/* Rework halo — a sibling outside the overflow-hidden card so the
          −16 px inset ring is visible. pointer-events:none so it never
          intercepts canvas hit-testing. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -16,
          border: `1.5px dashed ${REWORKING_COLOUR}`,
          borderRadius: 14,
          background: REWORKING_HALO_BG,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            fontFamily: 'var(--mono)',
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: 7.5,
            letterSpacing: '0.12em',
            color: REWORKING_COLOUR,
          }}
        >
          ● REWORKING
        </span>
      </div>
      {card}
    </div>
  );
};
