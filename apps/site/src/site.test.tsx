import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Cost } from './cost.js';
import { CostDemo } from './cost-demo.js';

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('cost module page (/cost)', () => {
  it('states what the module is, links each package source, and routes to its demo', () => {
    render(<Cost />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /stock-take a cloud estate/i,
    );
    const packagesBase = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';
    for (const pkg of [
      'cost-schema',
      'cost-provider',
      'cost-provider-azure',
      'cost-engine',
      'cost-ui',
      'cost-studio',
    ]) {
      expect(screen.getByRole('link', { name: `@workspec/${pkg}` })).toHaveAttribute(
        'href',
        `${packagesBase}/${pkg}`,
      );
    }
    for (const link of screen.getAllByRole('link', { name: /demo/i })) {
      expect(link).toHaveAttribute('href', '/cost/demo');
    }
  });

  it('uses the transparent WorkSpec wordmark lockup and exposes no module menu', () => {
    window.history.pushState({}, '', '/cost');
    render(<Cost />);

    const brand = screen.getByRole('link', { name: 'WorkSpec Cost' });
    expect(brand).toHaveAttribute('href', '/cost');
    expect(brand.querySelector('svg')).toHaveClass('brand-symbol');
    expect(brand).toHaveTextContent('workspec/ cost');
    expect(screen.queryByRole('link', { name: 'Cost' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'C4 Model' })).not.toBeInTheDocument();
  });
});

describe('cost demo page (/cost/demo)', () => {
  it('mounts the worked fieldstate-azure estate at 81.2% coverage', async () => {
    render(<CostDemo />);
    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    expect(screen.getByText('$2,474/mo unattributed')).toBeInTheDocument();
    expect(
      await screen.findByText(/webmcp tools available in supported agent browsers/i),
    ).toBeInTheDocument();
  });

  it('shows no redundant module switchers', () => {
    window.history.pushState({}, '', '/cost/demo');
    render(<CostDemo />);

    expect(screen.queryByRole('link', { name: 'Cost' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Studio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'C4 Model' })).not.toBeInTheDocument();
  });

  it('keeps the worked estate crumb and actions', async () => {
    render(<CostDemo />);
    expect(screen.getByText('fieldstate-azure')).toBeInTheDocument();
    await screen.findByText('81.2%');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});
