import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionWorkspace } from './workspace.js';
import {
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  renderWithHost,
} from './test-utils.js';

async function renderWorkspace(): Promise<HTMLElement> {
  renderWithHost(<DecisionWorkspace decisionRef={HOSTING_DECISION_REF} />, {
    host: createTestHost(createHostingRepository()),
  });
  await screen.findByText('AKS');
  const card = screen.getByText('AKS').closest('.ds-opt');
  if (card === null) throw new Error('no AKS card');
  return card as HTMLElement;
}

describe('a11y basics', () => {
  it('lever toggles are real switch buttons, labelled and keyboard-operable', async () => {
    const user = userEvent.setup();
    const aks = await renderWorkspace();

    // A real button with role=switch and an accessible name (the lever label).
    const reserve = within(aks).getByRole('switch', { name: 'Reserve steady prod' });
    expect(reserve.tagName).toBe('BUTTON');
    expect(reserve).toHaveAttribute('aria-checked', 'false');

    // Keyboard: focus and toggle with the keyboard, no mouse.
    reserve.focus();
    expect(reserve).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(reserve).toHaveAttribute('aria-checked', 'true');

    await user.keyboard(' ');
    expect(reserve).toHaveAttribute('aria-checked', 'false');
  });

  it('the option header is an expandable button exposing aria-expanded', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    // App Service is collapsed initially; its header toggles open on click.
    const appHeader = screen.getByText('App Service').closest('.ds-opt-head') as HTMLButtonElement;
    expect(appHeader.tagName).toBe('BUTTON');
    expect(appHeader).toHaveAttribute('aria-expanded', 'false');

    await user.click(appHeader);
    expect(appHeader).toHaveAttribute('aria-expanded', 'true');
  });

  it('cost inputs are labelled controls', async () => {
    const aks = await renderWorkspace();
    // The expanded editor exposes labelled numeric inputs per line/env.
    expect(within(aks).getByLabelText('System node pool prod quantity')).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(within(aks).getByLabelText('Postgres Flexible Server prod amount')).toBeInstanceOf(
      HTMLInputElement,
    );
  });

  it('criteria score dots are an accessible keyboard slider', async () => {
    const user = userEvent.setup();
    const aks = await renderWorkspace();
    const slider = within(aks).getByRole('slider', { name: 'Ops burden score' });
    expect(slider).toHaveAttribute('aria-valuenow', '2');

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '3');
  });
});
