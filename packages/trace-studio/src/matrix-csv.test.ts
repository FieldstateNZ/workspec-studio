import { describe, expect, it } from 'vitest';
import { buildModel } from '@workspec/trace-model';
import { buildMatrixFixtureRuns, buildMatrixFixtureTree } from './matrix-fixture.js';
import { buildMatrixRows } from './matrix-rows.js';
import { renderMatrixCsv } from './matrix-csv.js';

describe('renderMatrixCsv', () => {
  const rows = buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns()));
  const rendered = renderMatrixCsv(rows);

  it('starts with the exact header row, in the shared column order', () => {
    expect(rendered.split('\n')[0]).toBe('Feature,Rule,Scenario,Verifies,Status,Run,SHA');
  });

  it('quotes a field containing a comma, doubling nothing that needs no doubling', () => {
    expect(rendered).toContain('"Reporting, Audit & Compliance"');
  });

  it('quotes a field containing a quote, doubling every embedded quote', () => {
    expect(rendered).toContain(
      '"Author an element without leaving the canvas; A promise with a ""quote"" inside"',
    );
  });

  it('quotes a field containing both a comma and quotes together', () => {
    expect(rendered).toContain('"A scenario title with a <tag> and a comma, plus ""quotes"""');
  });

  it('leaves a pipe unquoted — CSV has no delimiter conflict with it', () => {
    expect(rendered).toContain(',A Rule | with a pipe,');
  });

  it('one line per row, plus the header, plus the trailing newline', () => {
    const lines = rendered.split('\n');
    expect(lines).toHaveLength(1 + rows.length + 1);
    expect(lines.at(-1)).toBe('');
  });

  it('matches the committed golden snapshot (byte-determinism)', () => {
    expect(rendered).toMatchSnapshot();
  });

  it('is deterministic: re-rendering the same rows yields an identical string', () => {
    expect(
      renderMatrixCsv(
        buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns())),
      ),
    ).toBe(rendered);
  });

  it('renders just the header for zero rows', () => {
    expect(renderMatrixCsv([])).toBe('Feature,Rule,Scenario,Verifies,Status,Run,SHA\n');
  });
});
