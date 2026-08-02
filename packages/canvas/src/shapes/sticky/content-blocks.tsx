import type { FC } from 'react';
import type {
  StickyAuthor,
  StickyChecklistItem,
  StickyReaction,
  StickyShape,
  StickyTag,
} from '../../shape-types.js';
import { STICKY_COLORS, resolveEyebrowLabel } from './sticky-shared.js';
import { AVATAR_INK, AVATAR_RING_SHADOW, avatarFill } from '../../style/shape-defaults.js';

/**
 * Shared Discovery-note content blocks (enterprise #356): the reusable
 * vocabulary every sticky-derived note type composes — the index/photo/
 * voice variants (#357–#359) and the typed artifact card (#360) import
 * these instead of re-implementing pills/avatars. Every block is
 * self-contained (no store access) and sized to reflow inside the 210×150
 * base paper.
 */

// ── Eyebrow ───────────────────────────────────────────────────────────────────

/**
 * The mono uppercase kicker every note shares: a colour dot + the resolved
 * label (note type → first tag → media → NOTE). `dotColor` overrides the
 * swatch for notes whose colour dot should read against their own surface.
 */
export const StickyEyebrow: FC<{ shape: StickyShape; dotColor?: string }> = ({
  shape,
  dotColor,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
    <span
      aria-hidden
      style={{
        width: 5,
        height: 5,
        borderRadius: 1,
        background: dotColor ?? STICKY_COLORS[shape.color].bg,
        flexShrink: 0,
      }}
    />
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {resolveEyebrowLabel(shape)}
    </span>
  </div>
);

// ── Tags ──────────────────────────────────────────────────────────────────────

export const StickyTags: FC<{ tags: StickyTag[] }> = ({ tags }) => {
  if (tags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
      {tags.map((tag, i) => (
        <span
          key={`${tag.label}-${String(i)}`}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            fontWeight: 600,
            lineHeight: 1.2,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '2px 6px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--sticky-tag-fill)',
            border: '1px solid var(--sticky-tag-line)',
            color: 'var(--ink-soft)',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
};

// ── Reactions ─────────────────────────────────────────────────────────────────

export const StickyReactions: FC<{ reactions: StickyReaction[] }> = ({ reactions }) => {
  if (reactions.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {reactions.map((reaction, i) => (
        <span
          key={`${reaction.emoji}-${String(i)}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 10,
            lineHeight: 1,
            padding: '1px 6px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--sticky-reaction-fill)',
          }}
        >
          <span>{reaction.emoji}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-soft)' }}>
            {reaction.count}
          </span>
        </span>
      ))}
    </div>
  );
};

// ── Author avatar ─────────────────────────────────────────────────────────────

function hueFromString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (first === undefined) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return ((first[0] ?? '') + (last?.[0] ?? '')).toUpperCase();
}

export const StickyAvatar: FC<{ author: StickyAuthor; size?: number }> = ({
  author,
  size = 20,
}) => {
  const hue = hueFromString(author.id ?? author.name);
  return (
    <span
      title={author.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarFill(hue),
        color: AVATAR_INK,
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        // White ring lifts the avatar off any paper colour without a token.
        boxShadow: AVATAR_RING_SHADOW,
      }}
    >
      {initials(author.name)}
    </span>
  );
};

// ── On-note checklist ─────────────────────────────────────────────────────────

export const StickyChecklist: FC<{
  items: StickyChecklistItem[];
  onToggle?: (id: string) => void;
}> = ({ items, onToggle }) => {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {items.map((item) => (
        <div
          key={item.id}
          // The canvas suppresses pointer events on shape bodies and routes hits
          // through its own hit-test; data-canvas-ui opts this row back in so an
          // on-note tick toggles instead of starting a drag/marquee.
          {...(onToggle ? { 'data-canvas-ui': true } : {})}
          onPointerDown={
            onToggle
              ? (e) => {
                  e.stopPropagation();
                  onToggle(item.id);
                }
              : undefined
          }
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            fontSize: 11.5,
            lineHeight: 1.3,
            cursor: onToggle ? 'pointer' : 'default',
            pointerEvents: onToggle ? 'auto' : undefined,
            opacity: item.done ? 0.6 : 1,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 13,
              height: 13,
              marginTop: 1,
              borderRadius: 3,
              border: '1.5px solid currentColor',
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {item.done ? '✓' : ''}
          </span>
          <span
            style={{
              minWidth: 0,
              textDecoration: item.done ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {item.text}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Footer row ────────────────────────────────────────────────────────────────

/**
 * The standard note footer: tags pinned left, reactions + author pinned
 * right. `margin-top:auto` lets it sit at the card bottom in a column flex
 * note.
 */
export const StickyFooter: FC<{
  tags?: StickyTag[] | undefined;
  reactions?: StickyReaction[] | undefined;
  author?: StickyAuthor | undefined;
}> = ({ tags, reactions, author }) => {
  const hasLeft = !!tags && tags.length > 0;
  const hasRight = (!!reactions && reactions.length > 0) || !!author;
  if (!hasLeft && !hasRight) return null;
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 6,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>{hasLeft && tags && <StickyTags tags={tags} />}</div>
      {hasRight && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {reactions && reactions.length > 0 && <StickyReactions reactions={reactions} />}
          {author && <StickyAvatar author={author} />}
        </div>
      )}
    </div>
  );
};
