import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { StickyShape } from '../../shape-types.js';
import { compressImageFile } from '../../hooks/use-image-input.js';
import { StickyEyebrow, StickyTags } from './content-blocks.js';
import { PHOTO_PLACEHOLDER_STRIPES } from '../../style/shape-defaults.js';

/**
 * Discovery media-note bodies (enterprise #357 index card, #358 photo,
 * #359 voice memo). Each renders the inner surface for one `media` value;
 * the outer positioning/selection-ring/enter-animation frame stays in
 * StickyShapeComponent. Per the specs these media always sit flat
 * (rotation 0°) and keep their media rendering across both lenses.
 */

interface BodyProps {
  shape: StickyShape;
  isDragging: boolean;
  onPatch: (patch: Partial<StickyShape>) => void;
}

// ── Index card (#357) ─────────────────────────────────────────────────────────

const INDEX_PADDING = '13px 13px 11px';

export const IndexCardBody: FC<BodyProps> = ({ shape, isDragging }) => {
  const hasTitle = !!shape.title && shape.title.length > 0;
  const hasTags = !!shape.tags && shape.tags.length > 0;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: INDEX_PADDING,
        paddingLeft: 24,
        background: 'var(--index-paper)',
        color: 'var(--index-ink)',
        border: '1px solid var(--index-edge)',
        borderRadius: 3,
        boxShadow: 'var(--sh-2)',
        backgroundImage:
          'repeating-linear-gradient(var(--index-paper) 0 24px, var(--index-rule) 24px 25px)',
        backgroundPositionY: '14px',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Pink margin rule — full height at 16px, independent of the ruled lines. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 16,
          top: 0,
          bottom: 0,
          width: 1.5,
          background: 'var(--index-margin)',
        }}
      />
      <StickyEyebrow shape={shape} dotColor="var(--index-margin)" />
      {hasTitle && (
        <div
          style={{
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            fontSize: 13.5,
            fontWeight: 700,
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {shape.title}
        </div>
      )}
      {shape.text && (
        <div
          style={{
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.25,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}
        >
          {shape.text}
        </div>
      )}
      {hasTags && shape.tags && (
        <div style={{ marginTop: 'auto', paddingTop: 6 }}>
          <StickyTags tags={shape.tags} />
        </div>
      )}
    </div>
  );
};

// ── Photo (#358) ──────────────────────────────────────────────────────────────

const CameraGlyph: FC = () => (
  <svg
    width="34"
    height="34"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--photo-glyph)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const PhotoBody: FC<BodyProps> = ({ shape, isDragging, onPatch }) => {
  const src = shape.image?.src;
  const [loading, setLoading] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef(shape.image);
  imageRef.current = shape.image;

  const ingest = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setLoading(true);
      try {
        const { src: dataUrl } = await compressImageFile(file);
        onPatch({ image: { ...imageRef.current, src: dataUrl } });
      } catch (err) {
        console.error('Failed to load photo:', err);
      } finally {
        setLoading(false);
      }
    },
    [onPatch],
  );

  // Native (not React) drop listener: the canvas binds its own native drop
  // handler on an ancestor to spawn a standalone ImageShape. Handling the drop
  // here in the bubble phase and calling stopPropagation keeps a photo dropped
  // on the mount replacing this note instead of also creating a loose image —
  // React's synthetic stopPropagation can't halt that ancestor native listener.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) void ingest(file);
    };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [ingest]);

  return (
    <div
      ref={mountRef}
      // Opt out of the canvas hit-test so a drag onto the mount targets this note.
      data-canvas-ui
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        background: 'var(--photo-mount)',
        color: 'var(--photo-ink)',
        borderRadius: 2,
        boxShadow: 'var(--sh-2)',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div
        style={{
          flex: 1,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(src
            ? {}
            : {
                backgroundColor: 'var(--photo-placeholder)',
                backgroundImage: PHOTO_PLACEHOLDER_STRIPES,
              }),
        }}
      >
        {src ? (
          <img
            src={src}
            alt={shape.image?.caption ?? 'Photo note'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ opacity: loading ? 0.4 : 1 }}>
            <CameraGlyph />
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "Caveat, 'Comic Sans MS', cursive",
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--photo-caption)',
          padding: '6px 2px 1px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {/* Empty-string caption falls through to the title (enterprise `||` semantics). */}
        {(shape.image?.caption ?? '') !== '' ? shape.image?.caption : (shape.title ?? '')}
      </div>
    </div>
  );
};

// ── Voice memo (#359) ─────────────────────────────────────────────────────────

const WAVEFORM_BARS = [7, 16, 11, 22, 14, 9, 19, 13, 24, 10, 17, 8, 20, 12, 15, 9];
const VOICE_DEFAULT_PLAYED = 6; // bars accent-filled at rest, per spec.
// Per-VIEWER playback position, deliberately a fixed global localStorage
// namespace keyed by shape id (like the sticky-defaults preference): playback
// progress is viewer-local UI state, not document state, so it never goes
// through the instance persistence seam. See utils/sticky-defaults.ts.
const voicePosKey = (id: string): string => `workspec-voice-pos-${id}`;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

/** Played-bar boundary persisted per viewer (0..16). Seeded to the spec's 6. */
function useVoiceProgress(id: string): [number, (n: number) => void] {
  const [played, setPlayed] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(voicePosKey(id));
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n)) return Math.min(WAVEFORM_BARS.length, Math.max(0, Math.round(n)));
      }
    } catch {
      /* localStorage unavailable — fall back to the default boundary */
    }
    return VOICE_DEFAULT_PLAYED;
  });
  const set = useCallback(
    (n: number) => {
      const clamped = Math.min(WAVEFORM_BARS.length, Math.max(0, Math.round(n)));
      setPlayed(clamped);
      try {
        localStorage.setItem(voicePosKey(id), String(clamped));
      } catch {
        /* best-effort persistence */
      }
    },
    [id],
  );
  return [played, set];
}

export const VoiceBody: FC<BodyProps> = ({ shape, isDragging }) => {
  const durationMs = shape.audio?.durationMs ?? 0;
  const [played, setPlayed] = useVoiceProgress(shape.id);
  const [playing, setPlaying] = useState(false);
  const playedRef = useRef(played);
  playedRef.current = played;

  useEffect(() => {
    if (!playing) return;
    // Advance the boundary across the whole waveform over the memo's duration;
    // with no real audio src this clock is the source of progress truth.
    const total = WAVEFORM_BARS.length;
    const perBarMs = durationMs > 0 ? durationMs / total : 600;
    const start = performance.now();
    const startBar = playedRef.current >= total ? 0 : playedRef.current;
    if (playedRef.current >= total) setPlayed(0);
    let raf = 0;
    const tick = (now: number): void => {
      const advanced = startBar + (now - start) / perBarMs;
      if (advanced >= total) {
        setPlayed(total);
        setPlaying(false);
        return;
      }
      setPlayed(Math.floor(advanced));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, durationMs, setPlayed]);

  const togglePlay = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
    setPlaying((p) => !p);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 9,
        padding: '13px 13px 11px',
        background: 'var(--bg-elevated)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        boxShadow: 'var(--sh-2)',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <button
          data-canvas-ui
          type="button"
          aria-label={playing ? 'Pause voice memo' : 'Play voice memo'}
          onPointerDown={togglePlay}
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            pointerEvents: 'auto',
            padding: 0,
          }}
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <rect x="2" y="1.5" width="3" height="9" rx="0.6" fill="var(--on-accent)" />
              <rect x="7" y="1.5" width="3" height="9" rx="0.6" fill="var(--on-accent)" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 1.8 L10 6 L3 10.2 Z" fill="var(--on-accent)" />
            </svg>
          )}
        </button>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              fontFamily: shape.fontFamily ?? 'var(--sans)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.2,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {/* Empty title/text fall through (enterprise `||` chain semantics). */}
            {(shape.title ?? '') !== '' ? shape.title : shape.text !== '' ? shape.text : 'Voice memo'}
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              lineHeight: 1.2,
              color: 'var(--ink-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {`Voice memo · ${formatDuration(durationMs)}`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
        {WAVEFORM_BARS.map((h, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              flex: 1,
              height: h,
              borderRadius: 2,
              background: i < played ? 'var(--accent)' : 'var(--line-2)',
            }}
          />
        ))}
      </div>
    </div>
  );
};
