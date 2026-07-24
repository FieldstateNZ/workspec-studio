import type { TopologyFileSource } from '../ports/topology-file-source.js';

/** Seed content for {@link createMemorySource}, keyed by repo-relative path. */
export type MemorySourceSeed = Readonly<Record<string, string>>;

/**
 * `Map`-backed {@link TopologyFileSource}: the browser-safe implementation,
 * exported from the package root. Seed it with an initial tree (e.g. lifted
 * straight from a golden fixture directory) and it behaves identically to
 * `FsSource` rooted at that same tree — this is what the MemorySource
 * round-trip tests in this package assert. Mirrors `@workspec/c4-model`'s
 * `createMemorySource` exactly.
 */
export function createMemorySource(seed: MemorySourceSeed = {}): TopologyFileSource {
  const files = new Map<string, string>(Object.entries(seed));

  return {
    async listFiles(dirPath) {
      const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      const entries: string[] = [];
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (rest.length > 0 && !rest.includes('/')) {
          entries.push(path);
        }
      }
      return entries;
    },
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`MemorySource: no file at "${path}"`);
      }
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async exists(path) {
      return files.has(path);
    },
  };
}
