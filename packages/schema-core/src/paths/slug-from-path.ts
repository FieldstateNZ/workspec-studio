import { FILE_EXTENSION } from './file-extension.js';

/**
 * Recovers the slug from an artifact path: the filename minus `.yaml`.
 * Returns `null` for paths that don't end in `.yaml` — callers treat that
 * as "not a WorkSpec artifact file" rather than an exception, since this is
 * commonly used while walking a directory tree that may hold other files.
 * Same shape as `@workspec/c4-schema`'s `slugFromPath`.
 */
export function slugFromPath(path: string): string | null {
  if (!path.endsWith(FILE_EXTENSION)) {
    return null;
  }
  const withoutExtension = path.slice(0, -FILE_EXTENSION.length);
  const lastSlash = withoutExtension.lastIndexOf('/');
  const slug = lastSlash === -1 ? withoutExtension : withoutExtension.slice(lastSlash + 1);
  return slug.length > 0 ? slug : null;
}
