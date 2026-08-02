import type { ShapeId } from '../../types.js';
import type { StickyColor, StickyNoteType, StickyShape } from '../../shape-types.js';

/**
 * Shared sticky look-up tables + deterministic geometry helpers (enterprise
 * issue #356). Downstream note variants (#357–#361) reuse the colour map,
 * eyebrow resolver, and torn clip-path so every Discovery note reads as the
 * same family of paper. All colours are @workspec/design tokens.
 */

export const STICKY_COLORS: Record<StickyColor, { bg: string; ink: string; edge: string }> = {
  yellow: {
    bg: 'var(--sticky-yellow-bg)',
    ink: 'var(--sticky-yellow-ink)',
    edge: 'var(--sticky-yellow-edge)',
  },
  pink: {
    bg: 'var(--sticky-pink-bg)',
    ink: 'var(--sticky-pink-ink)',
    edge: 'var(--sticky-pink-edge)',
  },
  blue: {
    bg: 'var(--sticky-blue-bg)',
    ink: 'var(--sticky-blue-ink)',
    edge: 'var(--sticky-blue-edge)',
  },
  green: {
    bg: 'var(--sticky-green-bg)',
    ink: 'var(--sticky-green-ink)',
    edge: 'var(--sticky-green-edge)',
  },
  orange: {
    bg: 'var(--sticky-orange-bg)',
    ink: 'var(--sticky-orange-ink)',
    edge: 'var(--sticky-orange-edge)',
  },
  purple: {
    bg: 'var(--sticky-purple-bg)',
    ink: 'var(--sticky-purple-ink)',
    edge: 'var(--sticky-purple-edge)',
  },
};

const NOTE_TYPE_LABELS: Record<StickyNoteType, string> = {
  need: 'USER NEED',
  idea: 'IDEA',
  pain: 'PAIN',
  question: 'QUESTION',
};

/**
 * noteType → type-colour token (the rail + eyebrow ink of the typed
 * artifact card, #360). `question` maps to `--type-q` — the token name the
 * spec fixes, distinct from the `--type-*` artifact-graph colours.
 */
const NOTE_TYPE_COLOR_VARS: Record<StickyNoteType, string> = {
  need: 'var(--type-need)',
  idea: 'var(--type-idea)',
  pain: 'var(--type-pain)',
  question: 'var(--type-q)',
};

export function noteTypeColorVar(noteType: StickyNoteType): string {
  return NOTE_TYPE_COLOR_VARS[noteType];
}

export function noteTypeLabel(noteType: StickyNoteType): string {
  return NOTE_TYPE_LABELS[noteType];
}

/** Ordered promote choices for the "type it →" picker (#361). */
export const NOTE_TYPE_OPTIONS: readonly StickyNoteType[] = ['need', 'idea', 'pain', 'question'];

const MEDIA_LABELS: Record<NonNullable<StickyShape['media']>, string> = {
  index: 'INDEX',
  photo: 'PHOTO',
  voice: 'VOICE',
};

/** Eyebrow label resolution order (spec): note type → first tag → media → NOTE. */
export function resolveEyebrowLabel(shape: StickyShape): string {
  if (shape.noteType) return NOTE_TYPE_LABELS[shape.noteType];
  const firstTag = shape.tags?.[0]?.label;
  if (firstTag) return firstTag.toUpperCase();
  if (shape.media) return MEDIA_LABELS[shape.media];
  return 'NOTE';
}

/**
 * Deterministic small tilt (−2.5°…+2.5°) seeded off the shape id so a note
 * keeps the same lean across renders. The structured lens passes 0 to sit
 * notes square.
 */
export function deterministicTilt(id: ShapeId): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  }
  const t = (hash % 1001) / 1000; // 0..1
  return Math.round((t * 5 - 2.5) * 10) / 10;
}

/**
 * ~7px zigzag top edge for the torn-paper variant. Bottom corners stay
 * square so the note still clips to its box; only the top reads as a
 * torn-off strip. `teeth` × 2 + 2 polygon points ≈ 14 points.
 */
export function tornClipPath(teeth = 6, depthPx = 7): string {
  const points: string[] = [];
  const step = 100 / (teeth * 2);
  for (let i = 0; i <= teeth * 2; i++) {
    const x = Math.min(100, i * step);
    const y = i % 2 === 0 ? `${String(depthPx)}px` : '0px';
    points.push(`${String(x)}% ${y}`);
  }
  points.push('100% 100%', '0% 100%');
  return `polygon(${points.join(', ')})`;
}
