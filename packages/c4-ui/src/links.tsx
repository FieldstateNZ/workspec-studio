// An element's "Traces to" links row, shown in the hover tooltip when the
// clicked/hovered node resolves to a real element carrying a `links` field
// (`@workspec/c4-schema`'s `linksField`: an array of `{<linkType>: <pathRef>}`
// entries, each optionally paired with a `cardinality`). Each entry is passed
// through the host's `LinkResolver`: unresolved links render as **inert
// labels** (a plain span — no anchor, no handler, nothing to click), resolved
// links render as an anchor (if an href is given) or a button (if an onClick
// is given). Mirrors packages/decision-ui's `LinksBlock`/`LinkRow` pattern —
// same contract shape, same inert-vs-active rendering rule.

import type { ReactElement } from 'react';
import type { LinkResolver, LinkTarget } from './host.js';

/**
 * Extracts the `{linkType, pathRef}` pair from one raw `links` array entry
 * (a `Record<string, unknown>` with exactly one non-`cardinality` key,
 * validated by `@workspec/c4-schema`'s `linksField` schema at load time —
 * this function trusts that shape rather than re-validating it).
 */
export function parseLinkEntry(entry: Readonly<Record<string, unknown>>): LinkTarget | null {
  const linkType = Object.keys(entry).find((key) => key !== 'cardinality');
  if (linkType === undefined) return null;
  const target = entry[linkType];
  if (typeof target !== 'string') return null;
  const label =
    target
      .split('/')
      .filter((part) => part.length > 0)
      .pop() ?? target;
  return { kind: linkType, label, target };
}

/** Every valid `{linkType, pathRef}` pair off a raw `links` array (invalid entries are dropped, not thrown). */
export function parseLinkEntries(
  entries: readonly Readonly<Record<string, unknown>>[],
): LinkTarget[] {
  const parsed: LinkTarget[] = [];
  for (const entry of entries) {
    const link = parseLinkEntry(entry);
    if (link) parsed.push(link);
  }
  return parsed;
}

function LinkRow(props: { link: LinkTarget; resolve: LinkResolver }): ReactElement {
  const { link, resolve } = props;
  const resolution = resolve(link);
  const kind = <span className="c4-lk-kind">{link.kind.replace(/-/g, ' ')}</span>;

  if (resolution.resolved && resolution.href !== undefined) {
    return (
      <a className="c4-lk c4-lk-active" href={resolution.href} title={resolution.title}>
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
        className="c4-lk c4-lk-active"
        title={resolution.title}
        onClick={onClick}
      >
        {kind}
        {link.label}
      </button>
    );
  }
  // Unresolved → inert label. Not focusable, not clickable.
  return (
    <span className="c4-lk" aria-disabled="true">
      {kind}
      {link.label}
    </span>
  );
}

/** The tooltip's "Traces to …" block. Renders nothing when there are no links. */
export function LinksBlock(props: {
  links: readonly LinkTarget[];
  resolve: LinkResolver;
}): ReactElement | null {
  if (props.links.length === 0) return null;
  return (
    <div className="c4-links">
      <span className="c4-links-lead">Traces to</span>
      {props.links.map((link, i) => (
        <LinkRow key={`${link.kind}:${link.target}:${i}`} link={link} resolve={props.resolve} />
      ))}
    </div>
  );
}
