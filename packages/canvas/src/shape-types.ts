// Concrete shape contracts for the OSS v1 shape scope (epic #116,
// decision G): the whiteboard base set (sticky/text/draw/image) plus the
// generic connector. Ported from the enterprise canvas `types.ts` with the
// enterprise-only fields removed per issue #117 (`drafted`, `atlasMade`,
// `atlasAuthored` — they return via module shape defs / `meta` in later
// slices). All contracts are `type` aliases (intersections over the
// `BaseShape` alias) so they stay assignable to the open `Shape` record —
// see the rationale note at the top of `types.ts`.

import type { BaseShape, ShapeId, Vec2 } from './types.js';

/** The six sticky-note paper colours. */
export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple';

/** Discovery note classification. Drives the eyebrow label + (downstream) lens
 *  promotion target. Undefined = an unclassified ("loose") note. */
export type StickyNoteType = 'need' | 'idea' | 'pain' | 'question';

/** Capture medium. Undefined = a plain paper sticky. */
export type StickyMedia = 'index' | 'photo' | 'voice';

/** A freeform label chip on a sticky note. */
export interface StickyTag {
  label: string;
}

/** An emoji reaction aggregated across viewers. */
export interface StickyReaction {
  emoji: string;
  count: number;
}

/** The note author shown as an avatar dot. */
export interface StickyAuthor {
  /** Stable identity the avatar hue is derived from (id falls back to name). */
  id?: string;
  name: string;
}

/** One checklist row on a sticky note. */
export interface StickyChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Photo-note payload (media='photo'). `src` is a compressed JPEG data URL; when
 *  absent the note shows the striped camera placeholder. */
export interface StickyImage {
  src?: string;
  /** Handwritten caption under the mount. */
  caption?: string;
}

/** Voice-memo payload (media='voice'). The waveform + duration come from here;
 *  playback position is per-viewer and lives in localStorage, not on the shape. */
export interface StickyAudio {
  src?: string;
  durationMs: number;
}

/** A sticky note — the discovery-board workhorse shape. */
export type StickyShape = BaseShape & {
  type: 'sticky';
  /** Body text. Pre-existing notes that only had `text` keep rendering as the body. */
  text: string;
  /** Optional bold title above the body (omitted when empty). */
  title?: string;
  color: StickyColor;
  /** CSS font-family; undefined = the host's `--sans`. */
  fontFamily?: string;
  noteType?: StickyNoteType;
  media?: StickyMedia;
  /** Framed image + caption when media='photo'. */
  image?: StickyImage;
  /** Waveform + duration when media='voice'. */
  audio?: StickyAudio;
  /** Jagged top edge (torn-off paper). No other visual difference from base. */
  torn?: boolean;
  tags?: StickyTag[];
  reactions?: StickyReaction[];
  author?: StickyAuthor;
  checklist?: StickyChecklistItem[];
};

/** A free-standing text label. */
export type TextShape = BaseShape & {
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  /** CSS color; undefined = the host's `var(--ink)`. */
  color?: string;
  /** CSS font-family; undefined = the host's `--sans`. */
  fontFamily?: string;
  /** true = user-set width, don't auto-fit; undefined/false = auto (single-line, grows with text). */
  lockWidth?: boolean;
  /** true = user-set height, don't auto-fit; undefined/false = auto (wraps at current width). */
  lockHeight?: boolean;
};

/** A freehand pen stroke: `points` are page-space, relative to the shape origin. */
export type DrawShape = BaseShape & {
  type: 'draw';
  points: Vec2[];
  strokeWidth: number;
  color: string;
};

/** A raster image dropped/pasted onto the canvas (`src` is a compressed JPEG data URL). */
export type ImageShape = BaseShape & {
  type: 'image';
  src: string;
  naturalWidth: number;
  naturalHeight: number;
};

/**
 * A connection-type key referencing the host's styling spec `connections`
 * record (see `CanvasSpecContext`), which defines its colour + line style.
 */
export type EdgeCategory = string;

/** Which view lens(es) an edge belongs to. */
export type EdgeLens = 'logical' | 'deployment' | 'both';

/**
 * Connector/edge between two node shapes. Endpoints are referenced by
 * ShapeId (render keys, resolved live from the store) AND by slug
 * (`edgeFrom`/`edgeTo` — the host-model identity, with the `'__system__'`
 * sentinel preserved verbatim). `freeEnd` is the dragging end during
 * creation/relink. The dual identity is a load-bearing contract with host
 * projection code — see the README.
 */
export type ConnectorShape = BaseShape & {
  type: 'connector';
  sourceShapeId: ShapeId | null;
  targetShapeId: ShapeId | null;
  freeEnd?: Vec2;
  edgeFrom: string;
  edgeTo: string;
  label?: string;
  category?: EdgeCategory;
  lens?: EdgeLens;
  laneOffset?: number;
  fanRole?: 'source-fan' | 'target-fan' | 'balanced';
  /** ER cardinality rendered at the endpoints ("0..*" ─ label ─ "1"). */
  cardinality?: { from: string; to: string };
};
