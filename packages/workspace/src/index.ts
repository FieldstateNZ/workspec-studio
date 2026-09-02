import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type WorkspaceFileMap = Readonly<Record<string, Uint8Array>>;

export interface WorkspaceSnapshot {
  readonly revision: number;
  readonly files: WorkspaceFileMap;
}

export interface ZipImportOptions {
  maxFiles?: number;
  maxUncompressedBytes?: number;
}

export class WorkspaceImportError extends Error {
  constructor(readonly code: 'invalid_zip' | 'missing_workspec' | 'too_large' | 'unsafe_path', message: string) {
    super(message);
    this.name = 'WorkspaceImportError';
  }
}

function safePath(input: string): string {
  const path = input.replaceAll('\\', '/').replace(/^\.\//, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
    throw new WorkspaceImportError('unsafe_path', `Unsafe ZIP path: ${input}`);
  }
  const marker = segments.indexOf('.workspec');
  if (marker < 0) return '';
  return segments.slice(marker).join('/');
}

export function importWorkspecZip(bytes: Uint8Array, options: ZipImportOptions = {}): WorkspaceFileMap {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch (reason) {
    throw new WorkspaceImportError('invalid_zip', reason instanceof Error ? reason.message : 'The ZIP could not be read.');
  }
  const maxFiles = options.maxFiles ?? 1_000;
  const maxBytes = options.maxUncompressedBytes ?? 25 * 1024 * 1024;
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [rawPath, content] of Object.entries(archive)) {
    const path = safePath(rawPath);
    if (path === '' || path.endsWith('/')) continue;
    total += content.byteLength;
    if (Object.keys(files).length >= maxFiles || total > maxBytes) {
      throw new WorkspaceImportError('too_large', `The workspace exceeds ${maxFiles} files or ${maxBytes} uncompressed bytes.`);
    }
    if (files[path] !== undefined) throw new WorkspaceImportError('unsafe_path', `Duplicate workspace path: ${path}`);
    files[path] = content.slice();
  }
  if (Object.keys(files).length === 0) {
    throw new WorkspaceImportError('missing_workspec', 'The ZIP does not contain a .workspec directory.');
  }
  return files;
}

export function exportWorkspecZip(files: WorkspaceFileMap): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, bytes])));
}

export class MemoryWorkspace {
  private current: Record<string, Uint8Array>;
  private revisionValue = 0;

  constructor(files: WorkspaceFileMap = {}) {
    this.current = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, bytes.slice()]));
  }

  get revision(): number { return this.revisionValue; }
  snapshot(): WorkspaceSnapshot { return { revision: this.revisionValue, files: this.files() }; }
  files(): WorkspaceFileMap { return Object.fromEntries(Object.entries(this.current).map(([path, bytes]) => [path, bytes.slice()])); }
  paths(): string[] { return Object.keys(this.current).sort(); }
  exists(path: string): boolean { return this.current[path] !== undefined; }
  readBytes(path: string): Uint8Array {
    const value = this.current[path];
    if (value === undefined) throw new Error(`No workspace file at "${path}".`);
    return value.slice();
  }
  readText(path: string): string { return strFromU8(this.readBytes(path)); }
  writeBytes(path: string, value: Uint8Array): void {
    if (safePath(path) !== path) {
      throw new WorkspaceImportError('unsafe_path', `Workspace writes must target .workspec/: ${path}`);
    }
    this.current[path] = value.slice();
    this.revisionValue += 1;
  }
  writeText(path: string, value: string): void { this.writeBytes(path, strToU8(value)); }
  remove(path: string): void {
    if (this.current[path] !== undefined) {
      this.current = Object.fromEntries(Object.entries(this.current).filter(([candidate]) => candidate !== path));
      this.revisionValue += 1;
    }
  }
  listFiles(directory: string): string[] {
    const prefix = directory.endsWith('/') ? directory : `${directory}/`;
    return this.paths().filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'));
  }
  toZip(): Uint8Array { return exportWorkspecZip(this.current); }
}

export function textFileMap(files: Readonly<Record<string, string>>): WorkspaceFileMap {
  return Object.fromEntries(Object.entries(files).map(([path, value]) => [path, strToU8(value)]));
}
