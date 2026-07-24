import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewSwitcher } from './view-switcher.js';

describe('ViewSwitcher', () => {
  it('renders exactly Topology / Drift / Cost — no Flows button (v0 has declared edges only)', () => {
    render(<ViewSwitcher value="topology" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Topology' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drift' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cost' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Flows' })).not.toBeInTheDocument();
  });

  it('marks the active view pressed and calls onChange with the clicked view', async () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="topology" onChange={onChange} />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Topology' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Drift' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Drift' }));
    expect(onChange).toHaveBeenCalledWith('drift');

    await user.click(screen.getByRole('button', { name: 'Cost' }));
    expect(onChange).toHaveBeenCalledWith('cost');
  });
});
