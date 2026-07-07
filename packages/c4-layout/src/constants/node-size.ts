/**
 * Default node footprint, matching WorkSpec Enterprise's `C4_NODE_WIDTH`/
 * `C4_NODE_HEIGHT` (all C4 nodes there are a fixed 300x110 — see the
 * conformance survey's Layout persistence section). Used for every unpinned
 * node, and as the fallback for a pinned node whose `.layout/` entry omits
 * `width`/`height`.
 */
export const C4_NODE_WIDTH = 300;

/** @see C4_NODE_WIDTH */
export const C4_NODE_HEIGHT = 110;
