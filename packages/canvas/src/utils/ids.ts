import { nanoid } from 'nanoid';
import type { ShapeId } from '../types.js';

/** Mint a fresh branded shape id (10-char nanoid — short enough for URLs and debug output). */
export const createShapeId = (): ShapeId => nanoid(10) as ShapeId;
