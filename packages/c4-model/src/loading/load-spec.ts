import { parseSpecYaml, WORKSPEC_DIR } from '@workspec/c4-schema';
import type { Spec } from '@workspec/c4-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { C4ModelSpec } from '../model/c4-model.types.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { C4FileSource } from '../ports/c4-file-source.js';

const SPEC_PATH = `${WORKSPEC_DIR}/spec.yaml`;

/**
 * Loads the singleton `spec.yaml`. A missing file is not an error — the
 * project style spec is optional everywhere, so this parses an empty
 * document through `Spec` and relies on that schema's own `.default({})`
 * behaviour for `elements`/`connections` to produce the same
 * defaults-equivalent value a present-but-empty `spec.yaml` would.
 */
export async function loadSpec(
  source: C4FileSource,
): Promise<{ spec: C4ModelSpec; diagnostics: readonly C4Diagnostic[] }> {
  const present = await source.exists(SPEC_PATH);
  if (!present) {
    return { spec: { path: null, data: defaultSpec() }, diagnostics: [] };
  }

  const text = await source.readFile(SPEC_PATH);
  const result = parseSpecYaml(text);
  if (!result.ok) {
    return {
      spec: { path: SPEC_PATH, data: defaultSpec() },
      diagnostics: parseIssuesToDiagnostics(SPEC_PATH, result.errors),
    };
  }

  return { spec: { path: SPEC_PATH, data: result.data }, diagnostics: [] };
}

/** `Spec`'s own `.default({})` behaviour, applied to an empty document — used whenever no valid spec is available. */
function defaultSpec(): Spec {
  const result = parseSpecYaml('{}');
  if (!result.ok) {
    throw new Error(
      'unreachable: an empty style spec document always satisfies the Spec schema defaults',
    );
  }
  return result.data;
}
