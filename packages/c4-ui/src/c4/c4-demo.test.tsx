import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { C4Demo, demoProjection } from './c4-demo.js';
import { edgeShapeId, nodeShapeId } from './project-model.js';
import type { ShapeId } from '@workspec/canvas';

// The S3 fixture story (#119): correct card chrome per kind, in light AND
// dark, through the real Canvas default stack + connector layer.

class ResizeObserverStub {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}

const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1400,
  bottom: 900,
  width: 1400,
  height: 900,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

describe('demoProjection', () => {
  test('projects every demo kind, the boundary and the categorised edges', () => {
    const p = demoProjection();
    for (const id of ['cli-user', 'billing', 'web-app', 'api', 'events', 'ledger']) {
      expect(p.shapes[nodeShapeId(id)]).toBeDefined();
    }
    expect(p.shapes['c4_boundary' as ShapeId]).toBeDefined();
    expect(p.shapes[edgeShapeId('api', 'ledger')]).toMatchObject({ category: 'data' });
  });
});

describe.each(['light', 'dark'] as const)('C4Demo (%s theme)', (theme) => {
  test('renders every kind card with its accent + chrome through the real canvas', () => {
    const { container } = render(
      <div style={{ position: 'relative', width: 1400, height: 900 }}>
        <C4Demo theme={theme} />
      </div>,
    );

    // Theme attribute drives the .c4-el dark derivation.
    expect(container.querySelector(`[data-theme="${theme}"]`)).not.toBeNull();

    const cards = [...container.querySelectorAll('.c4-el')];
    // Six nodes (the boundary is not a .c4-el).
    expect(cards).toHaveLength(6);

    const accentOf = (label: string): string => {
      const card = cards.find((c) => c.textContent?.includes(label));
      if (!card) throw new Error(`card ${label} missing`);
      return (card as HTMLElement).style.getPropertyValue('--el-accent-raw');
    };
    expect(accentOf('CLI User')).toBe('var(--el-actor)');
    expect(accentOf('Web App')).toBe('var(--el-container)');
    expect(accentOf('Ledger DB')).toBe('var(--el-database)');
    expect(accentOf('Event Bus')).toBe('var(--el-queue)');
    expect(accentOf('Billing Provider')).toBe('var(--el-external-system)');

    // Silhouette kinds: the database renders the cylinder frame.
    const db = cards.find((c) => c.textContent?.includes('Ledger DB'));
    expect(db?.querySelector('ellipse')).not.toBeNull();

    // The boundary panel + label tab render behind the cards.
    expect([...container.querySelectorAll('div')].some((d) => d.textContent === 'Demo System')).toBe(
      true,
    );

    // Connector layer: orthogonal C4 edges render as SVG paths with the
    // spec category accents feeding --conn-accent-raw — pinned PER
    // CATEGORY (interaction/data/identity are the demo's three) at the
    // value level, from the conformance-data defaults.
    const edgeGroups = [...container.querySelectorAll('g.c4-conn')];
    expect(edgeGroups.length).toBe(5);
    const accents = edgeGroups.map((g) =>
      (g as SVGGElement).style.getPropertyValue('--conn-accent-raw'),
    );
    expect(accents.filter((a) => a === '#64748b')).toHaveLength(2); // interaction ×2
    expect(accents.filter((a) => a === '#4CAF50')).toHaveLength(2); // data ×2
    expect(accents.filter((a) => a === '#4A90D9')).toHaveLength(1); // identity

    // Edge labels render as midpoint chips.
    expect(container.textContent).toContain('reads/writes');
  });
});

describe('dark derivation source pins (#119 FIX 2)', () => {
  // jsdom cannot compute color-mix, so the dark-theme acceptance pins the
  // derivation LITERALS at the source level (token-audit style): mutating
  // or deleting the dark .c4-el block must fail here, not silently pass.
  const css = readFileSync(join(process.cwd(), 'src', 'c4', 'index.css'), 'utf8');

  // The dark rules are grouped selector lists ("[data-theme='dark'] …,
  // .dark …, … {"); everything after the first dark group is the dark half
  // of the file (the light block precedes it).
  const darkHalf = css.split("[data-theme='dark'] .wsc-root .c4-el,")[1] ?? '';

  test('the dark block exists, scoped to data-theme/dark-class over .c4-el', () => {
    expect(darkHalf).not.toBe('');
    expect(darkHalf).toContain('.dark .wsc-root .c4-el');
    expect(darkHalf).toContain("[data-theme='dark'] .wsc-root .c4-el[data-scope='focus']");
  });

  test('the dark accent lift is the literal enterprise +22% toward white', () => {
    expect(darkHalf).toContain(
      '--el-accent: color-mix(in oklab, var(--el-accent-raw, var(--c4-el-fallback)), white 22%);',
    );
  });

  test('the dark watermark alpha is the literal enterprise 18%', () => {
    expect(darkHalf).toContain(
      '--el-watermark: color-mix(in oklab, var(--el-accent) 18%, transparent);',
    );
  });

  test('the light block wires the shared --el-tint-* tokens and the 14% watermark', () => {
    expect(css).toContain(
      '--el-surface: color-mix(in oklab, var(--el-accent) var(--el-tint-surface), var(--bg-elevated));',
    );
    expect(css).toContain(
      '--el-watermark: color-mix(in oklab, var(--el-accent) 14%, transparent);',
    );
  });

  test('the focus-scope deepening carries the enterprise literals (15/42 light, 20/48 dark)', () => {
    expect(css).toContain('--el-surface: color-mix(in oklab, var(--el-accent) 15%, var(--bg-elevated));');
    expect(css).toContain('--el-border: color-mix(in oklab, var(--el-accent) 42%, transparent);');
    expect(css).toContain('--el-surface: color-mix(in oklab, var(--el-accent) 20%, var(--bg-elevated));');
    expect(css).toContain('--el-border: color-mix(in oklab, var(--el-accent) 48%, transparent);');
  });
});
