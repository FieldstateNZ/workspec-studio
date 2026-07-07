/**
 * The repository-port every tree source implements: the loader (and,
 * later, drag-to-pin `.layout/` writes) talks only to this interface, never
 * to `node:fs` or a `Map` directly. Every path is POSIX-relative to the
 * repo root that contains `.workspec/` — e.g. `.workspec/actors/architect.yaml`,
 * never an absolute filesystem path.
 *
 * Kept deliberately small (four methods) — this is a port, not a general
 * filesystem abstraction. `FsSource` (Node, behind the `./fs` subpath
 * export) and `MemorySource` (root entry, browser-safe) are the two
 * implementations.
 */
export interface C4FileSource {
  /**
   * Lists the immediate (non-recursive) entries of `dirPath` as full
   * repo-relative paths, e.g. `listFiles('.workspec/actors')` resolves to
   * `['.workspec/actors/architect.yaml']`. Never descends into
   * subdirectories — this is what lets a listing of `.workspec/diagrams`
   * exclude the nested `.workspec/diagrams/.layout/` directory without any
   * special-casing by the caller. Resolves to `[]` for a missing directory;
   * never rejects for that reason.
   */
  listFiles(dirPath: string): Promise<readonly string[]>;
  /** Reads a file's full text content. Rejects if the file does not exist. */
  readFile(path: string): Promise<string>;
  /**
   * Writes (creating or overwriting) a file's full text content, creating
   * any missing parent directories. Not exercised by the read-only loader
   * pipeline in this slice — present so the same port serves the
   * drag-to-pin `.layout/` write path later without a breaking change.
   */
  writeFile(path: string, content: string): Promise<void>;
  /** True if `path` names an existing file. */
  exists(path: string): Promise<boolean>;
}
