import { describe, expect, it } from 'vitest';
import { buildModel } from '@workspec/trace-model';
import { buildMatrixFixtureRuns, buildMatrixFixtureTree } from './matrix-fixture.js';
import { buildMatrixRows } from './matrix-rows.js';
import { renderMatrixMarkdown } from './matrix-markdown.js';

describe('renderMatrixMarkdown', () => {
  const rows = buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns()));
  const rendered = renderMatrixMarkdown(rows);

  it('starts with the exact header + divider rows, in the shared column order', () => {
    const lines = rendered.split('\n');
    expect(lines[0]).toBe('| Feature | Rule | Scenario | Verifies | Status | Run | SHA |');
    expect(lines[1]).toBe('| --- | --- | --- | --- | --- | --- | --- |');
  });

  it('escapes a pipe in a cell so it cannot be mistaken for a column delimiter', () => {
    expect(rendered).toContain('A Rule \\| with a pipe');
    // The unescaped form must not appear anywhere (it would misparse the table).
    expect(rendered).not.toContain('| A Rule | with a pipe |');
  });

  it('leaves commas and quotes unescaped (Markdown tables only need pipes escaped)', () => {
    expect(rendered).toContain('A scenario title with a <tag> and a comma, plus "quotes"');
  });

  it('one line per row, plus the two header lines, plus the trailing newline', () => {
    const lines = rendered.split('\n');
    expect(lines).toHaveLength(2 + rows.length + 1); // +1 for the final '' after the trailing \n
    expect(lines.at(-1)).toBe('');
  });

  it('matches the committed golden snapshot (byte-determinism)', () => {
    expect(rendered).toMatchSnapshot();
  });

  it('is deterministic: re-rendering the same rows yields an identical string', () => {
    expect(
      renderMatrixMarkdown(
        buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns())),
      ),
    ).toBe(rendered);
  });

  it('renders just the header + divider for zero rows', () => {
    expect(renderMatrixMarkdown([])).toBe(
      '| Feature | Rule | Scenario | Verifies | Status | Run | SHA |\n| --- | --- | --- | --- | --- | --- | --- |\n',
    );
  });
});
