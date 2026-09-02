import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { Boxes, GitCompareArrows, Landmark, Network, Plus, Trash2 } from 'lucide-react';
import { parse, stringify } from 'yaml';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import { useTheme } from '@workspec/design';
import { DecisionArtifact } from '@workspec/decision-schema';
import { AdrView } from '@workspec/decision-ui';
import '@workspec/decision-ui/styles.css';
import { StudioShell } from '@workspec/studio-shell';
import type { StudioStatus, StudioStep } from '@workspec/studio-shell';
import '@workspec/studio-shell/styles.css';
import {
  InfrastructurePlanArtifact, buildProviderArtifacts, compareProviders,
  deriveInfrastructurePlan, serializeInfrastructurePlan, updateRequirement,
} from '@workspec/topology-planning';
import type { CloudProvider, InfrastructurePlan, ProviderOption } from '@workspec/topology-planning';
import { InfrastructurePlanEditor, ProviderComparison } from '@workspec/topology-ui';
import '@workspec/topology-ui/styles.css';
import { MemoryWorkspace, importWorkspecZip, textFileMap } from '@workspec/workspace';
import {
  DEFAULT_ARCHITECTURE_SNAPSHOT, buildArchitectureWorkspace, downloadBytes,
  bytesBase64, bytesDataUrl,
  loadArchitectureWorkspace, type ArchitectureElementKind, type ArchitectureSnapshot,
  type ArchitectureWorkspace,
} from './architecture-snapshot.js';
import type { WebMcpToolDefinition } from './cost-webmcp.js';
import { takePendingImport } from './pending-import.js';
import { navigate } from './router.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';
const MANAGED_C4 = ['.workspec/spec.yaml', '.workspec/system/', '.workspec/actors/', '.workspec/external-systems/', '.workspec/containers/', '.workspec/databases/', '.workspec/queues/', '.workspec/diagrams/'];
const WORKFLOW = ['design', 'plan', 'compare', 'decision'] as const;
type WorkflowStep = (typeof WORKFLOW)[number];
const STEPS: readonly StudioStep[] = [
  { id: 'design', label: 'Design', description: 'Design the C4 architecture', icon: <Network size={16} /> },
  { id: 'plan', label: 'Infrastructure', description: 'Build the provider-neutral shopping list', icon: <Boxes size={16} /> },
  { id: 'compare', label: 'Compare', description: 'Compare Azure and AWS', icon: <GitCompareArrows size={16} /> },
  { id: 'decision', label: 'Decision', description: 'Record the architecture decision', icon: <Landmark size={16} /> },
];

function initialStep(): WorkflowStep {
  const candidate = window.location.pathname.split('/').filter(Boolean).at(-1);
  return WORKFLOW.includes(candidate as WorkflowStep) ? candidate as WorkflowStep : 'design';
}
function textFiles(workspace: MemoryWorkspace): Record<string, string> {
  return Object.fromEntries(workspace.paths().filter((path) => /\.(?:ya?ml|json)$/i.test(path)).map((path) => [path, workspace.readText(path)]));
}
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'element';
}
function localDate(): string {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function decisionYaml(decision: ReturnType<typeof DecisionArtifact.parse>): string {
  return `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/decision.schema.json\n${stringify(decision, { lineWidth: 0 })}`;
}

export function StudioApp(): ReactElement {
  const theme = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  const canonicalRef = useRef<MemoryWorkspace | null>(null);
  const workspaceRef = useRef<ArchitectureWorkspace | null>(null);
  const planRef = useRef<InfrastructurePlan | null>(null);
  const optionsRef = useRef<ProviderOption[]>([]);
  const [workspace, setWorkspace] = useState<ArchitectureWorkspace | null>(null);
  const [plan, setPlan] = useState<InfrastructurePlan | null>(null);
  const [options, setOptions] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState<CloudProvider | undefined>();
  const [decision, setDecision] = useState<ReturnType<typeof DecisionArtifact.parse> | null>(null);
  const [step, setStepState] = useState<WorkflowStep>(initialStep);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StudioStatus>('checking');
  const [statusLabel, setStatusLabel] = useState('WebMCP checking');
  const [authoring, setAuthoring] = useState(false);
  const [newKind, setNewKind] = useState<ArchitectureElementKind>('container');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [rationale, setRationale] = useState('Balances managed-service simplicity, capability fit, and estimated monthly cost.');

  function setStep(next: string): void {
    if (!WORKFLOW.includes(next as WorkflowStep)) return;
    const value = next as WorkflowStep;
    setStepState(value);
    navigate(`/studio/${value}`);
  }

  function install(next: ArchitectureWorkspace, canonical: MemoryWorkspace, existingPlan?: InfrastructurePlan): void {
    const derived = existingPlan ?? deriveInfrastructurePlan(next.snapshot.system.name, next.snapshot.elements, ['dev', 'prod'], next.snapshot.relationships);
    canonical.writeText('.workspec/plans/infrastructure.yaml', serializeInfrastructurePlan(derived));
    canonicalRef.current = canonical;
    workspaceRef.current = { ...next, files: textFiles(canonical) };
    planRef.current = derived;
    const compared = compareProviders(derived);
    optionsRef.current = compared;
    setWorkspace(workspaceRef.current);
    setPlan(derived);
    setOptions(compared);
    setDecision(null);
    setSelected(undefined);
    setError(null);
  }

  async function startNew(): Promise<void> {
    const next = await buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, 0, false);
    install(next, new MemoryWorkspace(textFileMap(next.files)));
  }

  async function importFile(file: File): Promise<void> {
    setStatus('working'); setStatusLabel('Importing workspace');
    try {
      const canonical = new MemoryWorkspace(importWorkspecZip(new Uint8Array(await file.arrayBuffer())));
      let next: ArchitectureWorkspace;
      if (canonical.paths().some((path) => path.startsWith('.workspec/system/'))) {
        next = await loadArchitectureWorkspace(textFiles(canonical), (workspaceRef.current?.key ?? 0) + 1);
      } else {
        next = await buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, (workspaceRef.current?.key ?? 0) + 1, true);
        for (const [path, content] of Object.entries(next.files)) canonical.writeText(path, content);
      }
      let existingPlan: InfrastructurePlan | undefined;
      if (canonical.exists('.workspec/plans/infrastructure.yaml')) existingPlan = InfrastructurePlanArtifact.parse(parse(canonical.readText('.workspec/plans/infrastructure.yaml')));
      install(next, canonical, existingPlan);
      setStep('design');
      const ready = Boolean(document.modelContext?.registerTool);
      setStatus(ready ? 'ready' : 'unsupported'); setStatusLabel(ready ? 'WebMCP ready' : 'WebMCP unavailable');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('error'); setStatusLabel('Import failed');
    }
  }

  useEffect(() => {
    const pending = takePendingImport();
    if (pending) void importFile(pending); else void startNew();
  }, []);

  const host = useMemo<C4StudioHost>(() => ({
    linkResolver: createInertLinkResolver(), capabilities: { editLayout: true },
    source: {
      async listFiles(dirPath) { return canonicalRef.current?.listFiles(dirPath) ?? []; },
      async readFile(path) { const canonical = canonicalRef.current; if (!canonical) throw new Error('Workspace is loading.'); return canonical.readText(path); },
      async writeFile(path, content) {
        const canonical = canonicalRef.current; const current = workspaceRef.current;
        if (!canonical || !current) throw new Error('The workspace is still loading.');
        canonical.writeText(path, content);
        const next = { ...current, files: textFiles(canonical) };
        workspaceRef.current = next; setWorkspace(next);
      },
      async exists(path) { return canonicalRef.current?.exists(path) ?? false; },
    },
  }), []);

  async function replaceArchitecture(snapshot: ArchitectureSnapshot): Promise<void> {
    const canonical = canonicalRef.current;
    if (!canonical) throw new Error('The workspace is still loading.');
    const next = await buildArchitectureWorkspace(snapshot, (workspaceRef.current?.key ?? 0) + 1, true);
    const freshPlan = deriveInfrastructurePlan(next.snapshot.system.name, next.snapshot.elements, ['dev', 'prod'], next.snapshot.relationships);
    const previousById = new Map(planRef.current?.spec.requirements.map((item) => [item.id, item]) ?? []);
    const reconciledPlan = InfrastructurePlanArtifact.parse({
      ...freshPlan,
      spec: {
        ...freshPlan.spec,
        requirements: freshPlan.spec.requirements.map((item) => {
          const previous = previousById.get(item.id);
          return previous === undefined ? item : {
            ...item,
            size: previous.size,
            quantity: previous.quantity,
            availability: previous.availability,
            ...(previous.notes ? { notes: previous.notes } : {}),
          };
        }),
      },
    });
    for (const path of canonical.paths()) if (MANAGED_C4.some((prefix) => path === prefix || path.startsWith(prefix))) canonical.remove(path);
    for (const [path, content] of Object.entries(next.files)) canonical.writeText(path, content);
    install(next, canonical, reconciledPlan);
  }

  async function addElement(): Promise<void> {
    const current = workspaceRef.current;
    if (!current || !newName.trim() || !newDescription.trim()) return;
    let id = slug(newName); let suffix = 2;
    while (current.snapshot.elements.some((item) => item.id === id)) id = `${slug(newName)}-${suffix++}`;
    await replaceArchitecture({ ...current.snapshot, elements: [...current.snapshot.elements, { id, kind: newKind, name: newName.trim(), description: newDescription.trim() }] });
    setNewName(''); setNewDescription(''); setAuthoring(false);
  }

  async function removeElement(id: string): Promise<void> {
    const current = workspaceRef.current; if (!current) return;
    await replaceArchitecture({ ...current.snapshot, elements: current.snapshot.elements.filter((item) => item.id !== id), relationships: current.snapshot.relationships.filter((item) => item.from !== id && item.to !== id) });
  }

  function changeRequirements(changes: readonly { id: string; patch: Parameters<typeof updateRequirement>[2] }[]): void {
    const canonical = canonicalRef.current; const current = planRef.current;
    if (!canonical || !current) return;
    let next = current;
    for (const change of changes) {
      if (!next.spec.requirements.some((item) => item.id === change.id)) throw new Error(`Unknown requirement: ${change.id}`);
      next = updateRequirement(next, change.id, change.patch);
    }
    canonical.writeText('.workspec/plans/infrastructure.yaml', serializeInfrastructurePlan(next));
    const compared = compareProviders(next);
    planRef.current = next; optionsRef.current = compared;
    setPlan(next); setOptions(compared); setDecision(null);
  }

  function changeRequirement(id: string, patch: Parameters<typeof updateRequirement>[2]): void {
    changeRequirements([{ id, patch }]);
  }

  function recordDecision(provider = selected, reason = rationale): ReturnType<typeof DecisionArtifact.parse> {
    const canonical = canonicalRef.current; const currentPlan = planRef.current;
    const option = optionsRef.current.find((item) => item.provider === provider);
    if (!canonical || !currentPlan || !option) throw new Error('Select Azure or AWS before recording the decision.');
    for (const [path, content] of Object.entries(buildProviderArtifacts(currentPlan, option))) canonical.writeText(path, content);
    const alternative = optionsRef.current.find((item) => item.provider !== provider);
    const date = localDate();
    const artifact = DecisionArtifact.parse({
      apiVersion: 'workspec.io/v1alpha1', kind: 'Decision', metadata: { slug: 'cloud-platform' },
      spec: {
        title: `Use ${option.name} for the application platform`, status: 'accepted', created: date, decided: date,
        context: `The ${currentPlan.spec.title} needs a provider implementation for ${currentPlan.spec.requirements.length} infrastructure requirements across ${currentPlan.spec.environments.join(' and ')}.`,
        decision: `Adopt ${option.name}. The planning estimate is $${Math.round(option.monthlyTotal)} USD per month.`, rationale: reason,
        consequences: ['The provider-neutral plan remains the traceability source.', `Provider resources and pricing are materialized for ${option.provider}.`, 'Estimates must be refreshed before procurement.'],
        alternatives: alternative ? [{ title: alternative.name, reason: `Estimated at $${Math.round(alternative.monthlyTotal)} USD per month.` }] : undefined,
        references: [{ kind: 'InfrastructurePlan', target: '.workspec/plans/infrastructure.yaml' }, { kind: 'Topology', target: `.workspec/topologies/${option.provider}.yaml` }, { kind: 'Catalog', target: `.workspec/decisions/catalogs/${option.provider}.yaml` }],
        tags: ['cloud', option.provider, 'studio-generated'],
      },
    });
    canonical.writeText('.workspec/decisions/cloud-platform.yaml', decisionYaml(artifact));
    setDecision(artifact); setSelected(option.provider); setStep('decision');
    return artifact;
  }

  const actionsRef = useRef({ replaceArchitecture, changeRequirements, recordDecision });
  actionsRef.current = { replaceArchitecture, changeRequirements, recordDecision };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) { setStatus('unsupported'); setStatusLabel('WebMCP unavailable'); return; }
    const lifecycle = new AbortController();
    const register = (tool: WebMcpToolDefinition): void => { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => { setStatus('error'); setStatusLabel('WebMCP error'); }); };
    register({ name: 'get_workspec_workspace_summary', title: 'Inspect WorkSpec workspace', description: 'Read the current architecture, infrastructure requirements, provider comparison, and generated files.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return { project: workspaceRef.current?.snapshot.system.name, elements: workspaceRef.current?.snapshot.elements.length ?? 0, requirements: planRef.current?.spec.requirements.length ?? 0, providers: optionsRef.current.map((item) => ({ provider: item.provider, monthlyTotal: item.monthlyTotal })), files: canonicalRef.current?.paths() ?? [] }; } });
    register({ name: 'set_c4_architecture', title: 'Set C4 architecture', description: 'Replace the visible C4 architecture with a complete system, elements, and relationships snapshot, then regenerate the infrastructure plan.', inputSchema: { type: 'object', properties: { snapshot: { type: 'object' } }, required: ['snapshot'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { await actionsRef.current.replaceArchitecture(input.snapshot as ArchitectureSnapshot); return { updated: true, elements: workspaceRef.current?.snapshot.elements.length ?? 0, requirements: planRef.current?.spec.requirements.length ?? 0 }; } });
    register({ name: 'update_infrastructure_requirements', title: 'Update infrastructure requirements', description: 'Batch-update sizing, quantity, availability, or notes for provider-neutral requirements and refresh estimates.', inputSchema: { type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, size: { enum: ['small', 'medium', 'large'] }, quantity: { type: 'integer', minimum: 1 }, availability: { enum: ['standard', 'high'] }, notes: { type: 'string' } }, required: ['id'], additionalProperties: false } } }, required: ['changes'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { if (!Array.isArray(input.changes)) throw new Error('changes must be an array'); const changes = input.changes.map((raw) => { const change = raw as Record<string, unknown>; const id = String(change.id ?? ''); const { id: _id, ...patch } = change; return { id, patch }; }); actionsRef.current.changeRequirements(changes); return { updated: changes.length, providers: optionsRef.current.map((item) => ({ provider: item.provider, monthlyTotal: item.monthlyTotal })) }; } });
    register({ name: 'compare_cloud_providers', title: 'Compare Azure and AWS', description: 'Read Azure and AWS service mappings and monthly estimates for the current provider-neutral plan.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return { options: optionsRef.current }; } });
    register({ name: 'record_cloud_decision', title: 'Record cloud decision', description: 'Accept Azure or AWS, materialize its catalog, resources and topology, and write the ADR into the visible workspace.', inputSchema: { type: 'object', properties: { provider: { enum: ['azure', 'aws'] }, rationale: { type: 'string', minLength: 1 } }, required: ['provider', 'rationale'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const artifact = actionsRef.current.recordDecision(input.provider as CloudProvider, String(input.rationale)); return { recorded: true, decision: artifact.metadata.slug, provider: input.provider, files: canonicalRef.current?.paths() ?? [] }; } });
    register({ name: 'export_workspec_bundle', title: 'Export WorkSpec bundle', description: 'Read the complete current .workspec workspace as a base64-encoded ZIP so an agent can save or hand off the result without relying on a browser download event.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { const canonical = canonicalRef.current; const current = workspaceRef.current; if (!canonical || !current) throw new Error('The workspace is still loading.'); const bytes = canonical.toZip(); if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('The ZIP is too large for WebMCP export; use the visible download link.'); return { filename: `${slug(current.snapshot.system.name)}-workspec.zip`, mediaType: 'application/zip', encoding: 'base64', byteLength: bytes.byteLength, data: bytesBase64(bytes) }; } });
    setStatus('ready'); setStatusLabel('WebMCP ready');
    return () => lifecycle.abort();
  }, []);

  function download(): void {
    const canonical = canonicalRef.current; const current = workspaceRef.current;
    if (canonical && current) downloadBytes(`${slug(current.snapshot.system.name)}-workspec.zip`, canonical.toZip());
  }

  const completeDownload = canonicalRef.current && workspaceRef.current ? {
    href: bytesDataUrl(canonicalRef.current.toZip()),
    filename: `${slug(workspaceRef.current.snapshot.system.name)}-workspec.zip`,
  } : null;

  return (
    <StudioShell projectName={workspace?.snapshot.system.name ?? 'New WorkSpec project'} steps={STEPS} activeStep={step} onStepChange={setStep} collapsed={collapsed} onCollapsedChange={setCollapsed} status={status} statusLabel={statusLabel} onHome={() => navigate('/')} onImport={() => importRef.current?.click()} onDownload={download} repoUrl={REPO_URL} footer={<small className="journey-file-count">{canonicalRef.current?.paths().length ?? 0} workspace files</small>}>
      <input ref={importRef} hidden type="file" accept=".zip,application/zip" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }} />
      {error ? <div className="journey-error" role="alert">{error}</div> : null}
      {step === 'design' ? (
        <section className="journey-design" aria-label="Design architecture">
          <div className="journey-stage-head"><div><span>01 · Design</span><h1>Design the application</h1></div><p>Shape the C4 model. Every deployable element becomes a traceable infrastructure requirement.</p><button type="button" onClick={() => setAuthoring(!authoring)}><Plus size={15}/> Add element</button></div>
          {authoring ? <div className="journey-author-panel"><select aria-label="Element type" value={newKind} onChange={(event) => setNewKind(event.target.value as ArchitectureElementKind)}><option value="container">Container</option><option value="database">Database</option><option value="queue">Queue</option><option value="actor">Person</option><option value="external-system">External system</option></select><input aria-label="Element name" placeholder="Element name" value={newName} onChange={(event) => setNewName(event.target.value)}/><input aria-label="Element description" placeholder="What does it do?" value={newDescription} onChange={(event) => setNewDescription(event.target.value)}/><button type="button" onClick={() => void addElement()}>Add to model</button></div> : null}
          <div className="journey-design-grid"><div className="journey-canvas">{workspace ? <C4Explorer key={workspace.key} model={workspace.model} host={host} theme={theme} initialDiagramSlug="system-context" canvasChrome collapsibleDetails/> : <p>Building the architecture model…</p>}</div><aside className="journey-element-list"><header><strong>Model elements</strong><span>{workspace?.snapshot.elements.length ?? 0}</span></header>{workspace?.snapshot.elements.map((item) => <div key={item.id}><span><small>{item.kind}</small><strong>{item.name}</strong></span><button type="button" aria-label={`Remove ${item.name}`} onClick={() => void removeElement(item.id)}><Trash2 size={14}/></button></div>)}<button type="button" className="journey-next" onClick={() => setStep('plan')}>Build infrastructure plan →</button></aside></div>
        </section>
      ) : step === 'plan' && plan ? <InfrastructurePlanEditor plan={plan} onChange={changeRequirement} onContinue={() => setStep('compare')}/>
      : step === 'compare' ? <ProviderComparison options={options} {...(selected ? { selected } : {})} onSelect={setSelected} onContinue={() => setStep('decision')}/>
      : <section className="journey-decision"><header className="tp-plan-header"><div><span>04 · Decision</span><h1>Record the decision</h1><p>Choose an option and turn the comparison into a durable architecture decision record.</p></div></header>{decision ? <><div className="journey-complete"><strong>Decision recorded.</strong><span>The ADR, selected topology, catalog, environments, and resources are in the workspace.</span>{completeDownload ? <a href={completeDownload.href} download={completeDownload.filename}>Download complete .workspec ZIP</a> : null}</div><AdrView decisionRef="cloud-platform" decision={decision}/></> : <div className="journey-decision-form"><label>Selected provider<select value={selected ?? ''} onChange={(event) => setSelected(event.target.value as CloudProvider)}><option value="" disabled>Choose Azure or AWS</option><option value="azure">Microsoft Azure</option><option value="aws">Amazon Web Services</option></select></label><label>Rationale<textarea rows={5} value={rationale} onChange={(event) => setRationale(event.target.value)}/></label><button type="button" disabled={!selected || !rationale.trim()} onClick={() => recordDecision()}>Accept option and generate ADR</button></div>}</section>}
    </StudioShell>
  );
}
