import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRepository } from '@workspec/decision-schema';
import type { Decision, DecisionRepositoryPort } from '@workspec/decision-schema';
import { DecisionStudioProvider } from './context.js';
import type { DecisionStudioHost } from './host.js';

export const DECISION_REF = '.workspec/decisions/database.yaml';
export const CORE_DECISION: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'database' },
  spec: {
    title: 'Choose the primary database',
    status: 'accepted',
    created: '2026-08-01',
    decided: '2026-08-03',
    context: 'The service needs a durable transactional store.',
    decision: 'Use PostgreSQL as the primary database.',
    rationale: 'It fits the relational workload and the team already operates it.',
    consequences: ['Schema migrations become part of every release.'],
    alternatives: [{ title: 'Document database', reason: 'Weaker fit for relational queries.' }],
    tags: ['architecture'],
  },
};

export function createTestRepository(): DecisionRepositoryPort {
  return createMemoryRepository({ decisions: { [DECISION_REF]: CORE_DECISION } });
}

export function createTestHost(repository = createTestRepository()): DecisionStudioHost {
  return { repository, capabilities: { editDecision: true } };
}

export function renderWithHost(ui: ReactElement, host = createTestHost()): RenderResult {
  return render(<DecisionStudioProvider host={host}>{ui}</DecisionStudioProvider>);
}
