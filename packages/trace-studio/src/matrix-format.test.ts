import { describe, expect, it } from 'vitest';
import { resolveMatrixFormat } from './matrix-format.js';

describe('resolveMatrixFormat', () => {
  it("infers md/csv/html from --out's extension when --format is absent", () => {
    expect(resolveMatrixFormat('matrix.md', undefined)).toBe('md');
    expect(resolveMatrixFormat('matrix.csv', undefined)).toBe('csv');
    expect(resolveMatrixFormat('matrix.html', undefined)).toBe('html');
  });

  it('also accepts .markdown and .htm', () => {
    expect(resolveMatrixFormat('report.markdown', undefined)).toBe('md');
    expect(resolveMatrixFormat('report.htm', undefined)).toBe('html');
  });

  it('is case-insensitive on the extension', () => {
    expect(resolveMatrixFormat('MATRIX.CSV', undefined)).toBe('csv');
  });

  it('resolves the extension from a path with directories, not the whole string', () => {
    expect(resolveMatrixFormat('build.output/matrix.md', undefined)).toBe('md');
  });

  it('returns undefined for an unrecognised extension', () => {
    expect(resolveMatrixFormat('matrix.txt', undefined)).toBeUndefined();
  });

  it('returns undefined when --out has no extension at all', () => {
    expect(resolveMatrixFormat('matrix', undefined)).toBeUndefined();
  });

  it('returns undefined when neither --out nor --format is given', () => {
    expect(resolveMatrixFormat(undefined, undefined)).toBeUndefined();
  });

  it('--format overrides a conflicting --out extension', () => {
    expect(resolveMatrixFormat('matrix.csv', 'html')).toBe('html');
  });

  it("an invalid --format is a usage error, never falls back to --out's extension", () => {
    expect(resolveMatrixFormat('matrix.csv', 'xml')).toBeUndefined();
  });

  it('--format alone (no --out) resolves for stdout output', () => {
    expect(resolveMatrixFormat(undefined, 'md')).toBe('md');
  });
});
