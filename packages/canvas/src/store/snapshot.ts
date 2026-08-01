import { z } from 'zod';
import type { Camera, Shape, ShapeId } from '../types.js';

/**
 * The persisted canvas document: camera + every non-ephemeral shape.
 * Shapes serialise loosely (`Record<string, unknown>`) because module
 * fields are opaque to the engine; validation on load only checks the
 * BaseShape contract and passes everything else through. This shape (and
 * the `meta.ephemeral` exclusion in `exportSnapshot`) is public API —
 * hosts layer their own transport (REST/WS sync) on top of it.
 */
export interface CanvasSnapshot {
  version: 1;
  camera: Camera;
  shapes: Record<string, unknown>;
}

// `looseObject` = zod v4's passthrough object: module-owned fields on each
// shape survive the round-trip unvalidated.
const baseShapeSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  index: z.string(),
  rotation: z.number().optional(),
  groupId: z.string().optional(),
  containerId: z.string().optional(),
});

const snapshotSchema = z.object({
  version: z.literal(1),
  camera: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
  shapes: z.record(z.string(), baseShapeSchema),
});

/**
 * Read + validate a persisted snapshot from localStorage under `key`.
 * Any failure (no storage, malformed JSON, schema mismatch) returns an
 * empty partial so the store falls back to its defaults — a corrupt
 * snapshot must never brick the canvas.
 */
export function loadSnapshotFromStorage(key: string): Partial<{
  camera: Camera;
  shapes: Record<ShapeId, Shape>;
}> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const result = snapshotSchema.safeParse(parsed);
    if (!result.success) return {};
    const snap = result.data;
    return {
      camera: snap.camera,
      shapes: snap.shapes as unknown as Record<ShapeId, Shape>,
    };
  } catch {
    return {};
  }
}
