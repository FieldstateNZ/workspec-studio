import { describe, expect, it } from 'vitest';
import type { Decision } from '@workspec/decision-schema';
import { buildAdrModel, renderAdrMarkdown } from './adr.js';

const decision: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'use-postgres' },
  spec: {
    title: 'Use PostgreSQL',
    status: 'accepted',
    created: '2026-08-13',
    context: 'We need transactions.',
    decision: 'Use PostgreSQL.',
    rationale: 'The team already operates it.',
    consequences: ['Own database upgrades.'],
    alternatives: [{ title: 'MySQL', reason: 'No operational advantage.' }],
    references: [{ kind: 'issue', target: 'https://example.com/1', label: 'Tracking issue' }],
  },
};

describe('renderAdrMarkdown', () => {
  it('renders only authored Decision content deterministically', () => {
    const markdown = renderAdrMarkdown(buildAdrModel(decision, 'use-postgres'));
    expect(markdown).toContain('# Use PostgreSQL');
    expect(markdown).toContain('## Decision\n\nUse PostgreSQL.');
    expect(markdown).toContain('## Alternatives considered');
    expect(markdown).not.toContain('Currency');
    expect(renderAdrMarkdown(buildAdrModel(decision, 'use-postgres'))).toBe(markdown);
  });
});
