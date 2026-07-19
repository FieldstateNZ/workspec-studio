// Resolves which of the three RTM export formats (spec §6: `matrix --out
// matrix.{md,csv,html}`) a `matrix` invocation should render. Pure — no IO,
// no `node:path` — just the two already-parsed CLI strings in, a format (or
// `undefined` on anything unrecognised) out. Keeping this free of `node:*`
// imports means it could resolve a format for a browser-side export button
// (spec §5's Matrix view) too, not only the CLI.

/** The three RTM export formats spec §6 names. */
export type MatrixFormat = 'md' | 'csv' | 'html';

const KNOWN_FORMATS: ReadonlySet<string> = new Set<MatrixFormat>(['md', 'csv', 'html']);

/** File extension (lowercased, including the dot) -> the format it implies. */
const FORMAT_BY_EXTENSION: Readonly<Record<string, MatrixFormat>> = {
  '.md': 'md',
  '.markdown': 'md',
  '.csv': 'csv',
  '.html': 'html',
  '.htm': 'html',
};

function isMatrixFormat(value: string): value is MatrixFormat {
  return KNOWN_FORMATS.has(value);
}

/** The last path segment's extension (lowercased, with its dot), or `''` when it has none. */
function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/**
 * Resolve the export format from the CLI's already-parsed `--format` and
 * `--out` values. `--format` wins outright when present — it OVERRIDES
 * whatever `--out`'s extension would imply, and an unrecognised value is a
 * usage error rather than a silent fall-through to the extension. Without
 * `--format`, the format is inferred from `--out`'s extension. Returns
 * `undefined` when neither source yields one of `md`/`csv`/`html` — the CLI
 * turns that into exit code 2 with a message naming what it tried.
 */
export function resolveMatrixFormat(
  out: string | undefined,
  format: string | undefined,
): MatrixFormat | undefined {
  if (format !== undefined) {
    return isMatrixFormat(format) ? format : undefined;
  }
  if (out === undefined) return undefined;
  const ext = extensionOf(out);
  return ext.length > 0 ? FORMAT_BY_EXTENSION[ext] : undefined;
}
