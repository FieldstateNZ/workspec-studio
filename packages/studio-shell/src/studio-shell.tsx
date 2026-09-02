import type { ReactElement, ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight, Github, Home, PackageOpen } from 'lucide-react';
import { WorkspecMark } from '@workspec/design/components';

export interface StudioStep {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  complete?: boolean;
}

export type StudioStatus = 'checking' | 'ready' | 'working' | 'error' | 'unsupported';

export interface StudioShellProps {
  projectName: string;
  steps: readonly StudioStep[];
  activeStep: string;
  onStepChange: (id: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  status?: StudioStatus;
  statusLabel?: string;
  onHome?: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  repoUrl?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function StudioShell(props: StudioShellProps): ReactElement {
  const {
    projectName,
    steps,
    activeStep,
    onStepChange,
    collapsed,
    onCollapsedChange,
    status = 'checking',
    statusLabel = 'WebMCP checking',
    onHome,
    onImport,
    onDownload,
    repoUrl,
    footer,
    children,
  } = props;

  return (
    <div className={`ws-shell${collapsed ? ' ws-shell-collapsed' : ''}`}>
      <header className="ws-shell-header">
        <button className="ws-shell-brand" type="button" onClick={onHome} aria-label="WorkSpec Studio home">
          <WorkspecMark size={24} />
          <span>work<strong>spec</strong></span>
        </button>
        <span className="ws-shell-divider" aria-hidden="true" />
        <strong className="ws-shell-project">{projectName}</strong>
        <span className="ws-shell-spacer" />
        <span className={`ws-shell-status ws-shell-status-${status}`}>
          <span aria-hidden="true" />{statusLabel}
        </span>
        {repoUrl ? (
          <a className="ws-shell-icon" href={repoUrl} aria-label="View source on GitHub">
            <Github size={16} />
          </a>
        ) : null}
      </header>

      <div className="ws-shell-body">
        <aside className="ws-shell-sidebar" aria-label="Studio workflow">
          <nav className="ws-shell-nav">
            <p className="ws-shell-section">Workspace</p>
            <button className="ws-shell-nav-item" type="button" onClick={onHome} title="Studio home">
              <Home size={16} /><span>Studio home</span>
            </button>
            <button className="ws-shell-nav-item" type="button" onClick={onImport} title="Import .workspec ZIP">
              <PackageOpen size={16} /><span>Import workspace</span>
            </button>

            <p className="ws-shell-section">Workflow</p>
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={`ws-shell-nav-item${step.id === activeStep ? ' ws-shell-nav-active' : ''}`}
                type="button"
                onClick={() => onStepChange(step.id)}
                aria-current={step.id === activeStep ? 'step' : undefined}
                title={step.description ?? step.label}
              >
                <span className="ws-shell-step-index">{step.complete ? '✓' : index + 1}</span>
                <span className="ws-shell-step-icon">{step.icon}</span>
                <span>{step.label}</span>
              </button>
            ))}
          </nav>

          <div className="ws-shell-sidebar-bottom">
            {footer}
            {onDownload ? (
              <button className="ws-shell-download" type="button" onClick={onDownload}>
                Download .workspec
              </button>
            ) : null}
            <button
              className="ws-shell-collapse"
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => onCollapsedChange(!collapsed)}
            >
              {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
              <span>{collapsed ? '' : 'Collapse'}</span>
            </button>
          </div>
        </aside>
        <main className="ws-shell-main">{children}</main>
      </div>
    </div>
  );
}
