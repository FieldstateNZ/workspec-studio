import type { ReactElement, ReactNode } from 'react';
import { BookOpen, ChevronsLeft, ChevronsRight, Download, Github, Home, PackageOpen } from 'lucide-react';
import { WorkspecMark } from '@workspec/design/components';

export interface StudioStep {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  complete?: boolean;
  disabled?: boolean;
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
  headerActions?: ReactNode;
  rightSidebar?: ReactNode;
  onHome?: () => void;
  onImport?: () => void;
  onLoadExample?: () => void;
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
    headerActions,
    rightSidebar,
    onHome,
    onImport,
    onLoadExample,
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
        {headerActions}
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
            {onLoadExample ? (
              <button className="ws-shell-nav-item" type="button" onClick={onLoadExample} title="Load example workspace">
                <BookOpen size={16} /><span>Load example</span>
              </button>
            ) : null}

            <p className="ws-shell-section">Workflow</p>
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={`ws-shell-nav-item${step.id === activeStep ? ' ws-shell-nav-active' : ''}`}
                type="button"
                disabled={step.disabled}
                onClick={() => { if (!step.disabled) onStepChange(step.id); }}
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
              <button className="ws-shell-download" type="button" onClick={onDownload} aria-label="Download .workspec" title="Download .workspec">
                <Download size={16} /><span>Download .workspec</span>
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
        {rightSidebar}
      </div>
    </div>
  );
}
