import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import type { SafeParseOutcome } from './validate-then-write.js';
import { validateThenWrite } from './validate-then-write.js';

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') throw new Error('expected a text block');
  return block.text;
}

const genericMapError = (error: unknown): CallToolResult => ({
  content: [{ type: 'text', text: (error as Error).message }],
  isError: true,
});

describe('validateThenWrite', () => {
  it('rejects an invalid parse result without ever calling write', async () => {
    const write = vi.fn();
    const failure: SafeParseOutcome<unknown> = {
      success: false,
      error: { issues: [{ path: ['spec', 'schedules', 0, 'pct'], message: 'too big' }] },
    };

    const result = await validateThenWrite(failure, 'x.catalog.yaml', write, 'catalog', genericMapError);

    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe('invalid catalog');
    expect(body.issues[0]?.path).toBe('spec.schedules.0.pct');
    expect(write).not.toHaveBeenCalled();
  });

  it('writes and reports success on a valid parse result', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const success: SafeParseOutcome<{ id: string }> = { success: true, data: { id: 'x' } };

    const result = await validateThenWrite(success, 'x.decision.yaml', write, 'decision', genericMapError);

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toBe('wrote decision "x.decision.yaml"');
    expect(write).toHaveBeenCalledWith('x.decision.yaml', { id: 'x' });
  });

  it('routes a write failure through the caller-supplied mapError', async () => {
    const boom = new Error('disk full');
    const write = vi.fn().mockRejectedValue(boom);
    const mapError = vi.fn().mockReturnValue({ content: [{ type: 'text', text: 'mapped' }], isError: true });
    const success: SafeParseOutcome<{ id: string }> = { success: true, data: { id: 'x' } };

    const result = await validateThenWrite(success, 'x.decision.yaml', write, 'decision', mapError);

    expect(mapError).toHaveBeenCalledWith(boom, 'x.decision.yaml');
    expect(textOf(result)).toBe('mapped');
  });
});
