import { describe, expect, it } from 'vitest';
import * as c4Studio from './index.js';

describe('index — public barrel', () => {
  it('exports the CLI entry, the server, and the loader re-exports', () => {
    expect(typeof c4Studio.run).toBe('function');
    expect(typeof c4Studio.createServer).toBe('function');
    expect(typeof c4Studio.runServe).toBe('function');
    expect(typeof c4Studio.renderDiagramToSvg).toBe('function');
    expect(typeof c4Studio.loadC4Model).toBe('function');
    expect(typeof c4Studio.createFsSource).toBe('function');
    expect(typeof c4Studio.createMemorySource).toBe('function');
  });
});
