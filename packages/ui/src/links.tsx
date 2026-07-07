// The decision "Traces to" links row. Each link is passed through the host's
// LinkResolver: unresolved links render as **inert labels** (a plain span — no
// anchor, no handler, nothing to click), resolved links render as an anchor (if
// an href is given) or a button (if an onClick is given). The standalone host's
// inert resolver therefore yields a clean, error-free row of labels.

import type { ReactElement } from 'react';
import type { LinkType } from '@workspec/decision-schema';
import type { LinkResolver } from './host.js';

const KIND_ACCENT: Record<string, string> = {
  deployment: 'var(--ds-accent)',
  feature: 'var(--ds-type-feature)',
  'system-requirement': 'var(--ds-type-persona)',
};

function kindColor(kind: string): string {
  return KIND_ACCENT[kind] ?? 'var(--ds-ink-fade)';
}

function LinkRow(props: { link: LinkType; resolve: LinkResolver }): ReactElement {
  const { link, resolve } = props;
  const resolution = resolve(link);
  const swatch = <span className="ds-lk-sq" style={{ background: kindColor(link.kind) }} />;
  const kind = <span className="ds-lk-kind">{link.kind.replace(/-/g, ' ')}</span>;

  if (resolution.resolved && resolution.href !== undefined) {
    return (
      <a className="ds-lk ds-lk-active" href={resolution.href} title={resolution.title}>
        {swatch}
        {kind}
        {link.label}
      </a>
    );
  }
  if (resolution.resolved && resolution.onClick !== undefined) {
    const onClick = resolution.onClick;
    return (
      <button
        type="button"
        className="ds-lk ds-lk-active"
        title={resolution.title}
        onClick={onClick}
      >
        {swatch}
        {kind}
        {link.label}
      </button>
    );
  }
  // Unresolved → inert label. Not focusable, not clickable.
  return (
    <span className="ds-lk" aria-disabled="true">
      {swatch}
      {kind}
      {link.label}
    </span>
  );
}

/** The "Traces to …" links block. Renders nothing when there are no links. */
export function LinksBlock(props: {
  links: LinkType[];
  resolve: LinkResolver;
}): ReactElement | null {
  if (props.links.length === 0) return null;
  return (
    <div className="ds-links">
      <span className="ds-eyebrow ds-links-lead">Traces to</span>
      {props.links.map((link, i) => (
        <LinkRow key={`${link.kind}:${link.label}:${i}`} link={link} resolve={props.resolve} />
      ))}
    </div>
  );
}
