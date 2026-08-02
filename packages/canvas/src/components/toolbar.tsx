import { useEffect, useRef, useState, type FC, type MouseEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Hand,
  ImagePlus,
  MousePointer2,
  Pencil,
  Redo2,
  StickyNote,
  Type,
  Undo2,
} from 'lucide-react';
import { useCanvasInstance, useCanvasStore } from '../canvas-provider.js';
import { Kbd, Tooltip } from './tooltip.js';
import type { ToolName } from '../types.js';
import {
  getStickyDefaults,
  setStickyDefaults,
  type StickyColor,
  type StickyDefaults,
} from '../utils/sticky-defaults.js';

// Ported from the enterprise Toolbar.tsx (#118). Adaptations, all logged
// in the S2 report: the radix tooltip/kbd became the vendored CSS pair
// (components/tooltip.tsx); the prototype-layer section (flow tool +
// add-screen buttons, `layer` prop) stays enterprise with the screen
// family; tool buttons only render when their tool is registered on the
// instance (the static enterprise set is what registerWhiteboard
// installs).

// ── Shared ────────────────────────────────────────────────────────────────────

interface ToolButtonProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void;
  buttonRef?: Ref<HTMLButtonElement>;
  badge?: ReactNode;
}

const ToolButton: FC<ToolButtonProps> = ({
  icon,
  label,
  shortcut,
  isActive,
  disabled,
  onClick,
  onContextMenu,
  buttonRef,
  badge,
}) => (
  <Tooltip label={label} {...(shortcut !== undefined ? { shortcut } : {})}>
    <button
      ref={buttonRef}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={label}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 'var(--r-3)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? 'var(--on-accent)' : disabled ? 'var(--ink-ghost)' : 'var(--ink-soft)',
        transition: 'background-color 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isActive && !disabled) {
          e.currentTarget.style.backgroundColor = 'var(--bg-soft)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {icon}
      {badge}
    </button>
  </Tooltip>
);

// ── Sticky defaults menu ──────────────────────────────────────────────────────

const COLOR_SWATCHES: { color: StickyColor; bg: string }[] = [
  { color: 'yellow', bg: 'var(--sticky-yellow-bg)' },
  { color: 'pink', bg: 'var(--sticky-pink-bg)' },
  { color: 'blue', bg: 'var(--sticky-blue-bg)' },
  { color: 'green', bg: 'var(--sticky-green-bg)' },
  { color: 'orange', bg: 'var(--sticky-orange-bg)' },
  { color: 'purple', bg: 'var(--sticky-purple-bg)' },
];

const FONT_OPTIONS: { label: string; fontFamily: string; preview: string }[] = [
  { label: 'Sans', fontFamily: 'var(--sans)', preview: 'Inter Tight, system-ui, sans-serif' },
  { label: 'Mono', fontFamily: 'var(--mono)', preview: 'JetBrains Mono, ui-monospace, monospace' },
  { label: 'Script', fontFamily: 'Caveat, cursive', preview: 'Caveat, cursive' },
];

const MENU_W = 192;

interface StickyMenuProps {
  anchor: { x: number; y: number };
  defaults: StickyDefaults;
  onUpdate: (patch: Partial<StickyDefaults>) => void;
  onClose: () => void;
}

const StickyDefaultsMenu: FC<StickyMenuProps> = ({ anchor, defaults, onUpdate, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-canvas-ui
      className="wsc-root"
      style={{
        position: 'fixed',
        left: anchor.x - MENU_W / 2,
        top: anchor.y,
        transform: 'translateY(calc(-100% - 8px))',
        zIndex: 99999,
        width: MENU_W,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        boxShadow: 'var(--sh-3)',
        padding: '10px 10px 12px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: 'var(--mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--ink-muted)',
          fontWeight: 500,
          marginBottom: 10,
        }}
      >
        Sticky defaults
      </div>

      {/* Color row */}
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500, marginBottom: 6 }}>
        Color
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 5,
          marginBottom: 12,
        }}
      >
        {COLOR_SWATCHES.map(({ color, bg }) => (
          <button
            key={color}
            type="button"
            aria-label={`Sticky colour ${color}`}
            onClick={() => {
              onUpdate({ color });
            }}
            style={{
              aspectRatio: '1',
              background: bg,
              borderRadius: 5,
              border:
                defaults.color === color ? '2.5px solid var(--ink)' : '1.5px solid var(--line)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          />
        ))}
      </div>

      {/* Font rows */}
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500, marginBottom: 6 }}>
        Font
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FONT_OPTIONS.map(({ label, fontFamily, preview }) => {
          const isActive = defaults.fontFamily === fontFamily;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                onUpdate({ fontFamily });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                background: isActive ? 'var(--bg-soft)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--line)' : 'transparent'}`,
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  fontFamily: preview,
                  fontSize: 15,
                  color: 'var(--ink)',
                  width: 28,
                  lineHeight: 1,
                }}
              >
                Aa
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-soft)',
                  fontFamily: 'var(--sans)',
                  flex: 1,
                }}
              >
                {label}
              </span>
              {isActive && <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

// ── Toolbar ───────────────────────────────────────────────────────────────────

const STANDARD_TOOLS: { name: ToolName; icon: ReactNode; label: string; shortcut: string }[] = [
  { name: 'select', icon: <MousePointer2 size={16} />, label: 'Select', shortcut: 'V' },
  { name: 'hand', icon: <Hand size={16} />, label: 'Hand', shortcut: 'H' },
  { name: 'text', icon: <Type size={16} />, label: 'Text', shortcut: 'T' },
  { name: 'draw', icon: <Pencil size={16} />, label: 'Draw', shortcut: 'D' },
];

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** Open the image file picker (wire to `useImageInput().openFilePicker`). Omitted = no image button. */
  onUploadImage?: () => void;
}

/**
 * The bottom-docked tool strip: select/hand/text/draw/sticky + image
 * upload + undo/redo, with the sticky-defaults right-click menu (portal).
 */
export const Toolbar: FC<ToolbarProps> = ({ onUploadImage }) => {
  const instance = useCanvasInstance();
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const history = useCanvasStore((s) => s.history);

  const canUndo = history.pointer >= 0;
  const canRedo = history.pointer < history.stack.length - 1;

  // Sticky defaults + context menu
  const [stickyDefs, setStickyDefs] = useState<StickyDefaults>(() => getStickyDefaults());
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const stickyBtnRef = useRef<HTMLButtonElement>(null);

  const openStickyMenu = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const updateStickyDefault = (patch: Partial<StickyDefaults>): void => {
    setStickyDefaults(patch);
    setStickyDefs(getStickyDefaults());
  };

  // Color dot badge shown on the sticky button
  const colorDot = (
    <span
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: `var(--sticky-${stickyDefs.color}-bg)`,
        border: '1px solid var(--line)',
        pointerEvents: 'none',
      }}
    />
  );

  const divider = (
    <div style={{ width: 1, height: 24, backgroundColor: 'var(--line)', margin: '0 4px' }} />
  );

  return (
    <>
      <div
        data-canvas-ui
        data-export-exclude
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'var(--bg-elevated)',
          borderRadius: 12,
          padding: '6px 10px',
          boxShadow: 'var(--sh-3)',
          border: '1px solid var(--line)',
          pointerEvents: 'auto',
        }}
      >
        {STANDARD_TOOLS.filter(({ name }) => instance.tools.get(name) !== undefined).map(
          ({ name, icon, label, shortcut }) => (
            <ToolButton
              key={name}
              icon={icon}
              label={label}
              shortcut={shortcut}
              isActive={activeTool === name}
              onClick={() => {
                setActiveTool(name);
              }}
            />
          ),
        )}

        {/* Sticky — right-click for defaults */}
        {instance.tools.get('sticky') !== undefined && (
          <ToolButton
            icon={<StickyNote size={16} />}
            label="Sticky (right-click for defaults)"
            shortcut="S"
            isActive={activeTool === 'sticky'}
            buttonRef={stickyBtnRef}
            badge={colorDot}
            onClick={() => {
              setActiveTool('sticky');
            }}
            onContextMenu={openStickyMenu}
          />
        )}

        {onUploadImage !== undefined && (
          <>
            {divider}
            <ToolButton
              icon={<ImagePlus size={16} />}
              label="Upload Image"
              isActive={false}
              onClick={onUploadImage}
            />
          </>
        )}

        {divider}

        <ToolButton
          icon={<Undo2 size={16} />}
          label="Undo"
          shortcut="⌘Z"
          isActive={false}
          disabled={!canUndo}
          onClick={undo}
        />
        <ToolButton
          icon={<Redo2 size={16} />}
          label="Redo"
          shortcut="⌘⇧Z"
          isActive={false}
          disabled={!canRedo}
          onClick={redo}
        />
      </div>

      {menuAnchor && (
        <StickyDefaultsMenu
          anchor={menuAnchor}
          defaults={stickyDefs}
          onUpdate={updateStickyDefault}
          onClose={() => {
            setMenuAnchor(null);
          }}
        />
      )}
    </>
  );
};

// Re-export the vendored primitives so hosts building their own chrome get
// the same tooltip/kbd pair the toolbar uses.
export { Kbd, Tooltip };
