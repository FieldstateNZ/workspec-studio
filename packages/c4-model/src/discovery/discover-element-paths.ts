import { TYPE_DIRECTORIES, WORKSPEC_DIR } from '@workspec/c4-schema';
import type { ElementKind } from '../model/element-kind.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { listYamlFiles } from './list-yaml-files.js';

/** Every element file path discovered for one kind, e.g. `.workspec/actors/architect.yaml`. */
export interface DiscoveredElementPaths {
  readonly kind: ElementKind;
  readonly paths: readonly string[];
}

/**
 * Enumerates `.workspec/<type-dir>/*.yaml` for every element kind
 * (`TYPE_DIRECTORIES` from `@workspec/c4-schema`). A missing type directory
 * yields an empty `paths` list rather than a diagnostic — an empty tree, or
 * one that simply has no actors yet, loads cleanly.
 */
export async function discoverElementPaths(source: C4FileSource): Promise<readonly DiscoveredElementPaths[]> {
  return Promise.all(
    ELEMENT_KINDS.map(async (kind) => ({
      kind,
      paths: await listYamlFiles(source, `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`),
    })),
  );
}
