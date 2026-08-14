import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Alternative, Decision, DecisionStatus, Ref } from '@workspec/decision-schema';
import { Button, Card, Lbl } from '@workspec/design/components';
import { useCapabilities, useDecision, useWriteDecision } from './context.js';
import { decisionSlug } from './host.js';

export interface DecisionWorkspaceProps {
  decisionRef: Ref;
  action?: ReactNode;
}

function Notice(props: { error?: boolean; children: string }): ReactElement {
  return (
    <div className={props.error ? 'ds-notice ds-notice-error' : 'ds-notice'}>{props.children}</div>
  );
}

const STATUSES: DecisionStatus[] = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'];

function lines(value: string): string[] | undefined {
  const result = value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  return result.length > 0 ? result : undefined;
}

function alternatives(value: string): Alternative[] | undefined {
  const result = value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [title, ...reason] = item.split('|').map((part) => part.trim());
      return reason.join(' | ').length > 0
        ? { title: title as string, reason: reason.join(' | ') }
        : { title: title as string };
    });
  return result.length > 0 ? result : undefined;
}

function alternativesText(value: Alternative[] | undefined): string {
  return (value ?? [])
    .map((item) => (item.reason ? `${item.title} | ${item.reason}` : item.title))
    .join('\n');
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
}): ReactElement {
  const controlProps = {
    className: props.multiline ? 'ds-core-input ds-core-textarea' : 'ds-core-input',
    value: props.value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      props.onChange(event.target.value),
    placeholder: props.placeholder,
    disabled: props.disabled,
  };
  return (
    <label className="ds-core-field">
      <span>{props.label}</span>
      {props.multiline ? <textarea {...controlProps} /> : <input {...controlProps} />}
    </label>
  );
}

export function DecisionWorkspace(props: DecisionWorkspaceProps): ReactElement {
  const query = useDecision(props.decisionRef);
  if (query.isPending) return <Notice>Loading decision…</Notice>;
  if (query.isError)
    return <Notice error>{`Could not load decision: ${query.error.message}`}</Notice>;
  if (query.data === undefined) return <Notice error>Decision not found.</Notice>;
  return (
    <DecisionEditor
      key={props.decisionRef}
      decisionRef={props.decisionRef}
      initial={query.data}
      action={props.action}
    />
  );
}

function DecisionEditor(props: {
  decisionRef: Ref;
  initial: Decision;
  action?: ReactNode;
}): ReactElement {
  const [draft, setDraft] = useState(props.initial);
  const capabilities = useCapabilities();
  const write = useWriteDecision();
  const editable = capabilities.editDecision;

  useEffect(() => setDraft(props.initial), [props.initial]);

  const updateSpec = (patch: Partial<Decision['spec']>): void => {
    setDraft((current) => ({ ...current, spec: { ...current.spec, ...patch } }));
  };
  const optional = (
    key: keyof Decision['spec'],
    value: string | string[] | Alternative[] | undefined,
  ): void => {
    setDraft((current) => {
      const spec = Object.fromEntries(
        Object.entries(current.spec).filter(([field]) => field !== key),
      );
      if (value !== undefined && value !== '') spec[key] = value;
      return { ...current, spec: spec as Decision['spec'] };
    });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(props.initial);

  return (
    <>
      <div className="ds-app-toolbar">
        <span className="ds-app-toolbar-label">Edit</span>
        <div className="ds-app-toolbar-actions">
          {props.action}
          {editable && (
            <Button
              size="sm"
              disabled={!dirty || write.isPending}
              onClick={() => write.mutate({ ref: props.decisionRef, decision: draft })}
            >
              {write.isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      <div className="ds-wrap ds-core-editor">
        <div className="ds-dechead">
          <div className="ds-dechead-meta">
            <Lbl>{`Decision · ${decisionSlug(draft, props.decisionRef)}`}</Lbl>
            <h1 className="ds-dechead-title">{draft.spec.title}</h1>
            <p className="ds-ctx">Repository-native architecture decision record</p>
          </div>
          <span className={`ds-core-status ds-core-status-${draft.spec.status}`}>
            {draft.spec.status}
          </span>
        </div>

        {!editable && <Notice>This host has opened the record read-only.</Notice>}
        {write.isError && <Notice error>{`Save failed: ${write.error.message}`}</Notice>}
        {write.isSuccess && !dirty && <Notice>Saved to the repository.</Notice>}

        <Card className="ds-core-panel">
          <div className="ds-core-grid ds-core-grid-meta">
            <Field
              label="Title"
              value={draft.spec.title}
              disabled={!editable}
              onChange={(title) => updateSpec({ title })}
            />
            <label className="ds-core-field">
              <span>Status</span>
              <select
                className="ds-core-input"
                value={draft.spec.status}
                disabled={!editable}
                onChange={(event) => updateSpec({ status: event.target.value as DecisionStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Created"
              value={draft.spec.created ?? ''}
              placeholder="YYYY-MM-DD"
              disabled={!editable}
              onChange={(value) => optional('created', value)}
            />
            <Field
              label="Decided"
              value={draft.spec.decided ?? ''}
              placeholder="YYYY-MM-DD"
              disabled={!editable}
              onChange={(value) => optional('decided', value)}
            />
          </div>
        </Card>

        <Card className="ds-core-panel ds-core-grid">
          <Field
            label="Context"
            value={draft.spec.context}
            multiline
            disabled={!editable}
            onChange={(context) => updateSpec({ context })}
          />
          <Field
            label="Decision"
            value={draft.spec.decision}
            multiline
            disabled={!editable}
            onChange={(decision) => updateSpec({ decision })}
          />
          <Field
            label="Rationale"
            value={draft.spec.rationale ?? ''}
            multiline
            disabled={!editable}
            onChange={(value) => optional('rationale', value)}
          />
          <Field
            label="Consequences (one per line)"
            value={(draft.spec.consequences ?? []).join('\n')}
            multiline
            disabled={!editable}
            onChange={(value) => optional('consequences', lines(value))}
          />
          <Field
            label="Alternatives (title | reason, one per line)"
            value={alternativesText(draft.spec.alternatives)}
            multiline
            disabled={!editable}
            onChange={(value) => optional('alternatives', alternatives(value))}
          />
        </Card>

        <Card className="ds-core-panel ds-core-grid ds-core-grid-meta">
          <Field
            label="Deciders (one per line)"
            value={(draft.spec.deciders ?? []).join('\n')}
            multiline
            disabled={!editable}
            onChange={(value) => optional('deciders', lines(value))}
          />
          <Field
            label="Tags (one per line)"
            value={(draft.spec.tags ?? []).join('\n')}
            multiline
            disabled={!editable}
            onChange={(value) => optional('tags', lines(value))}
          />
          <Field
            label="Supersedes"
            value={draft.spec.supersedes ?? ''}
            disabled={!editable}
            onChange={(value) => optional('supersedes', value)}
          />
          <Field
            label="Filename slug assertion"
            value={draft.metadata.slug ?? ''}
            disabled={!editable}
            onChange={(value) =>
              setDraft((current) => ({ ...current, metadata: value === '' ? {} : { slug: value } }))
            }
          />
        </Card>
      </div>
    </>
  );
}
