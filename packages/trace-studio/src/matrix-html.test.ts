import { describe, expect, it } from 'vitest';
import { buildModel } from '@workspec/trace-model';
import { buildMatrixFixtureRuns, buildMatrixFixtureTree } from './matrix-fixture.js';
import { buildMatrixRows } from './matrix-rows.js';
import { renderMatrixHtml } from './matrix-html.js';

describe('renderMatrixHtml', () => {
  const rows = buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns()));
  const rendered = renderMatrixHtml(rows);

  it('is a self-contained document: a doctype, an inline <style>, and no external references', () => {
    expect(rendered.startsWith('<!doctype html>')).toBe(true);
    expect(rendered).toContain('<style>');
    expect(rendered).not.toContain('<link ');
    expect(rendered).not.toContain('<script src');
    expect(rendered).not.toMatch(/https?:\/\//);
  });

  it('renders the header row with the shared column labels, in order', () => {
    expect(rendered).toContain(
      '<tr><th>Feature</th><th>Rule</th><th>Scenario</th><th>Verifies</th><th>Status</th><th>Run</th><th>SHA</th></tr>',
    );
  });

  it('escapes < and > so an authored angle-bracket cannot be mistaken for markup', () => {
    expect(rendered).toContain('A scenario title with a &lt;tag&gt; and a comma');
    expect(rendered).not.toContain('<tag>');
  });

  it('escapes " so an authored quote cannot break out of an attribute', () => {
    expect(rendered).toContain('plus &quot;quotes&quot;');
    expect(rendered).toContain('A promise with a &quot;quote&quot; inside');
  });

  it('escapes & so an authored ampersand renders literally, not as an entity reference', () => {
    expect(rendered).toContain('Reporting, Audit &amp; Compliance');
  });

  it('tags each Status cell with a status-<value> class for the four canonical proof states', () => {
    expect(rendered).toContain('<td class="status-pass">pass</td>');
    expect(rendered).toContain('<td class="status-fail">fail</td>');
    expect(rendered).toContain('<td class="status-skip">skip</td>');
    expect(rendered).toContain('<td class="status-unproven">unproven</td>');
  });

  it('matches the committed golden snapshot (byte-determinism)', () => {
    expect(rendered).toMatchSnapshot();
  });

  it('is deterministic: re-rendering the same rows yields an identical string', () => {
    expect(
      renderMatrixHtml(
        buildMatrixRows(buildModel(buildMatrixFixtureTree(), buildMatrixFixtureRuns())),
      ),
    ).toBe(rendered);
  });

  it('renders an empty <tbody> for zero rows, still a valid self-contained document', () => {
    const empty = renderMatrixHtml([]);
    expect(empty).toContain('<tbody>\n\n</tbody>');
    expect(empty.startsWith('<!doctype html>')).toBe(true);
  });
});
