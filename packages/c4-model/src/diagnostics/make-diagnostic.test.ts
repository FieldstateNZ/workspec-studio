import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import { makeDiagnostic } from './make-diagnostic.js';

describe('makeDiagnostic', () => {
  it('derives slug from the file path', () => {
    const diagnostic = makeDiagnostic('error', DIAGNOSTIC_CODES.danglingRef, 'oops', '.workspec/actors/architect.yaml');
    expect(diagnostic).toEqual({
      severity: 'error',
      code: DIAGNOSTIC_CODES.danglingRef,
      message: 'oops',
      file: '.workspec/actors/architect.yaml',
      slug: 'architect',
    });
  });

  it('includes line/col only when a position is given', () => {
    const withPosition = makeDiagnostic('error', DIAGNOSTIC_CODES.parseError, 'oops', '.workspec/spec.yaml', {
      position: { line: 3, col: 4 },
    });
    expect(withPosition.line).toBe(3);
    expect(withPosition.col).toBe(4);

    const withoutPosition = makeDiagnostic('warning', DIAGNOSTIC_CODES.duplicateSlug, 'oops', '.workspec/spec.yaml');
    expect(withoutPosition.line).toBeUndefined();
    expect(withoutPosition.col).toBeUndefined();
  });

  it('includes refSlug only when given, alongside the file-derived slug', () => {
    const withRef = makeDiagnostic('error', DIAGNOSTIC_CODES.danglingRef, 'oops', '.workspec/diagrams/ctx.yaml', {
      refSlug: 'ghost',
    });
    expect(withRef.slug).toBe('ctx');
    expect(withRef.refSlug).toBe('ghost');

    const withoutRef = makeDiagnostic('error', DIAGNOSTIC_CODES.noSystem, 'oops', '.workspec/diagrams/ctx.yaml');
    expect(withoutRef.refSlug).toBeUndefined();
  });
});
