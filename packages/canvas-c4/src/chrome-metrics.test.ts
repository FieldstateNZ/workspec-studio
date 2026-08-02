// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chrome-metric source pins (#119 FIX 8): the headline card metrics the S3
// report calls byte-matching, asserted at the SOURCE level so a combined
// typography/border mutant cannot survive jsdom's inability to compute
// styles. Full visual pinning (screenshots) lands with the S4 parity
// harness — these are the interim tripwires.

const component = readFileSync(
  join(process.cwd(), 'src', 'shapes', 'c4-node-component.tsx'),
  'utf8',
);

describe('C4 card chrome metrics (source pins)', () => {
  it('4px solid accent left border, dashed for the external variant', () => {
    expect(component).toContain("borderLeft: '4px solid var(--el-accent)'");
    expect(component).toContain("borderLeftStyle: nodeVariant === 'external' ? 'dashed' : 'solid'");
  });

  it('eyebrow: 10px semibold uppercase, 0.12em tracking, --el-eyebrow ink', () => {
    const eyebrow = component.split('labelForType(shape.nodeType)}')[0] ?? '';
    expect(eyebrow).toContain('fontSize: 10');
    expect(eyebrow).toContain('fontWeight: 600');
    expect(eyebrow).toContain("textTransform: 'uppercase'");
    expect(eyebrow).toContain("letterSpacing: '0.12em'");
    expect(eyebrow).toContain("color: 'var(--el-eyebrow)'");
  });

  it('title 15px/600; description 12px, leading-relaxed 1.625, two-line clamp', () => {
    expect(component).toContain('fontSize: 15');
    expect(component).toContain('lineHeight: 1.625');
    expect(component).toContain('className="wsc-c4-clamp2"');
  });

  it('radii: pill 999 / box 10; DRAFT chip at the Tailwind-v4 rounded-sm 4px', () => {
    expect(component).toContain("borderRadius: nodeShape === 'pill' ? 999 : 10");
    expect(component).toContain('borderRadius: 4');
  });

  it('watermark: 88px icon at strokeWidth 1.25 bleeding off (−12,−14)', () => {
    expect(component).toContain('strokeWidth={1.25}');
    expect(component).toContain('width: 88');
    expect(component).toContain('right: -12');
    expect(component).toContain('bottom: -14');
  });

  it('selected ring + 30% accent glow; hover dashed outline; dim filter literals', () => {
    expect(component).toContain(
      "'0 0 0 2px var(--el-accent), 0 6px 20px color-mix(in oklab, var(--el-accent) 30%, transparent)'",
    );
    expect(component).toContain("outline: active && !selected ? '2px dashed var(--el-accent)'");
    expect(component).toContain("filter: dimmed && !selected && !active ? 'grayscale(0.7) brightness(0.92)'");
  });

  it('rework halo: −16 inset, 1.5px dashed, radius 14', () => {
    expect(component).toContain('inset: -16');
    expect(component).toContain('1.5px dashed ${REWORKING_COLOUR}');
    expect(component).toContain('borderRadius: 14');
  });
});
