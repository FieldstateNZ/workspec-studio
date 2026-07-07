import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';
import { createMemoryRepository } from '@workspec/decision-schema';
import type { Decision } from '@workspec/decision-schema';
import { DecisionAdr } from './adr.js';
import {
  HOSTING_CATALOG_REF,
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  loadHostingCatalog,
  loadHostingDecision,
  renderWithHost,
} from './test-utils.js';

const DECIDE_HOST = { capabilities: { editCatalog: true, decide: true } };
const READONLY_HOST = { capabilities: { editCatalog: false, decide: false } };

describe('DecisionAdr — renders the shared ADR model', () => {
  it('shows the context, considered options, decision and links', async () => {
    renderWithHost(<DecisionAdr decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(createHostingRepository(), READONLY_HOST),
    });
    await screen.findByText('Considered options');

    expect(screen.getByText('Context')).toBeInTheDocument();
    // Every option appears in the considered list.
    for (const name of ['AKS', 'App Service', 'Isolated App Service (ASE)']) {
      expect(screen.getByText(name, { selector: '.ds-ac-nm' })).toBeInTheDocument();
    }
    // Exploring → the recommended option (AKS) is flagged "proposed".
    const aks = screen.getByText('AKS', { selector: '.ds-ac-nm' }).closest('.ds-ac') as HTMLElement;
    expect(within(aks).getByText('proposed')).toBeInTheDocument();
    // Links section carries the decision's traces.
    expect(screen.getByText('FEAT-204 Unified warehouse')).toBeInTheDocument();
    // Read-only host → no decide affordance.
    expect(screen.queryByRole('button', { name: 'Decide' })).toBeNull();
    expect(screen.queryByLabelText('Decision rationale')).toBeNull();
  });
});

describe('DecisionAdr — decide round-trips through the port', () => {
  it('records status + outcome and the ADR markdown then carries the rationale', async () => {
    const user = userEvent.setup();
    const repository = createHostingRepository();
    renderWithHost(<DecisionAdr decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(repository, DECIDE_HOST),
    });
    await screen.findByText('Considered options');

    const rationaleText = 'We accept a heavier ops burden in exchange for AKS scale headroom.';
    const rationale = screen.getByLabelText('Decision rationale');
    await user.clear(rationale);
    await user.type(rationale, rationaleText);
    await user.click(screen.getByRole('button', { name: 'Decide' }));

    // Persisted through the port with status + outcome.
    const stored = await repository.readDecision(HOSTING_DECISION_REF);
    expect(stored.metadata.status).toBe('decided');
    expect(stored.spec.outcome?.option).toBe('aks'); // recommended default winner
    expect(stored.spec.outcome?.rationale).toBe(rationaleText);
    expect(stored.spec.outcome?.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The SAME renderer the CLI uses now carries the rationale.
    const markdown = renderAdrMarkdown(buildAdrModel(stored, loadHostingCatalog()));
    expect(markdown).toContain(rationaleText);
    expect(markdown).toContain('- **Status:** Accepted');

    // The view flips to the decided state (Reopen offered).
    expect(await screen.findByRole('button', { name: /Reopen decision/ })).toBeInTheDocument();
  });

  it('reopens a decided decision back to exploring', async () => {
    const user = userEvent.setup();
    const decided = loadHostingDecision();
    decided.metadata.status = 'decided';
    decided.spec.outcome = { option: 'aks', rationale: 'Prior rationale.' };
    const repository = createMemoryRepository({
      decisions: { [HOSTING_DECISION_REF]: decided },
      catalogs: { [HOSTING_CATALOG_REF]: loadHostingCatalog() },
    });

    renderWithHost(<DecisionAdr decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(repository, DECIDE_HOST),
    });
    await user.click(await screen.findByRole('button', { name: /Reopen decision/ }));

    const stored = await repository.readDecision(HOSTING_DECISION_REF);
    expect(stored.metadata.status).toBe('exploring');
    expect(stored.spec.outcome).toBeUndefined();
  });

  it('persists an inline rationale edit on a decided record', async () => {
    const user = userEvent.setup();
    const decided = loadHostingDecision();
    decided.metadata.status = 'decided';
    decided.spec.outcome = { option: 'aks', rationale: 'Original rationale.' };
    const repository = createMemoryRepository({
      decisions: { [HOSTING_DECISION_REF]: decided },
      catalogs: { [HOSTING_CATALOG_REF]: loadHostingCatalog() },
    });

    renderWithHost(<DecisionAdr decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(repository, DECIDE_HOST),
    });
    const rationale = await screen.findByLabelText('Decision rationale');
    await user.clear(rationale);
    await user.type(rationale, 'Refined after review.');
    await user.tab(); // blur commits

    const persisted = await repository.readDecision(HOSTING_DECISION_REF);
    expect(persisted.spec.outcome?.rationale).toBe('Refined after review.');
  });
});

describe('DecisionAdr — superseded is read-only with a pointer', () => {
  function supersededRepo(): ReturnType<typeof createMemoryRepository> {
    const old: Decision = loadHostingDecision();
    old.metadata.id = 'dec-old';
    old.metadata.status = 'superseded';
    const next: Decision = loadHostingDecision();
    next.metadata.id = 'dec-new';
    next.metadata.title = 'Hosting platform (revised)';
    next.metadata.status = 'decided';
    next.metadata.supersedes = 'dec-old';
    next.spec.outcome = { option: 'aks', rationale: 'Revised choice.' };
    return createMemoryRepository({
      decisions: { 'old.decision.yaml': old, 'new.decision.yaml': next },
      catalogs: { [HOSTING_CATALOG_REF]: loadHostingCatalog() },
    });
  }

  it('renders read-only and points to the superseding decision', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithHost(<DecisionAdr decisionRef="old.decision.yaml" />, {
      host: createTestHost(supersededRepo(), { ...DECIDE_HOST, navigate }),
    });
    await screen.findByText('Superseded', { selector: 'h4' });

    // No decide / reopen controls on a superseded record.
    expect(screen.queryByRole('button', { name: 'Decide' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reopen/ })).toBeNull();

    // The pointer to the superseding decision resolves and navigates.
    const pointer = await screen.findByRole('button', { name: /Open superseding decision/ });
    await user.click(pointer);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'decision', target: 'new.decision.yaml' }),
    );
  });
});
