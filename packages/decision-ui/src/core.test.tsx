import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionAdr } from './adr.js';
import { DecisionApp } from './app.js';
import { DecisionWorkspace } from './workspace.js';
import {
  DECISION_REF,
  createTestHost,
  createTestRepository,
  renderWithHost,
} from './test-utils.js';

describe('core Decision Studio', () => {
  it('lands on the ADR and enters record editing explicitly', async () => {
    const user = userEvent.setup();
    renderWithHost(<DecisionApp decisionRef={DECISION_REF} />);

    expect(
      await screen.findByRole('heading', { name: 'Choose the primary database' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('Choose the primary database');
    await user.clear(title);
    await user.type(title, 'Unsaved title');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('heading', { name: 'Choose the primary database' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Title')).toHaveValue('Choose the primary database');
  });

  it('renders a Decision as an ADR without a catalog', async () => {
    renderWithHost(<DecisionAdr decisionRef={DECISION_REF} />);
    expect(
      await screen.findByRole('heading', { name: 'Choose the primary database' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Use PostgreSQL as the primary database.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alternatives considered' })).toBeInTheDocument();
  });

  it('writes an edited Decision through the three-operation port', async () => {
    const repository = createTestRepository();
    const user = userEvent.setup();
    renderWithHost(<DecisionWorkspace decisionRef={DECISION_REF} />, createTestHost(repository));
    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Choose a durable database');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await repository.readDecision(DECISION_REF)).spec.title).toBe(
      'Choose a durable database',
    );
  });
});
