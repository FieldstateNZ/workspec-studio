import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudioShell } from './studio-shell.js';

describe('StudioShell', () => {
  it('renders Enterprise-style workspace and workflow navigation', () => {
    const html = renderToStaticMarkup(
      <StudioShell
        projectName="Ledger"
        steps={[{ id: 'design', label: 'Design', icon: <span>icon</span> }, { id: 'plan', label: 'Plan', icon: <span>icon</span>, disabled: true }]}
        activeStep="design"
        onStepChange={() => undefined}
        collapsed={false}
        onCollapsedChange={() => undefined}
        status="ready"
        statusLabel="WebMCP ready"
        onImport={() => undefined}
        onLoadExample={() => undefined}
        onDownload={() => undefined}
      >
        <p>Workspace</p>
      </StudioShell>,
    );
    expect(html).toContain('Ledger');
    expect(html).toContain('WebMCP ready');
    expect(html).toContain('Import workspace');
    expect(html).toContain('Load example');
    expect(html).toContain('Download .workspec');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('disabled=""');
  });
});
