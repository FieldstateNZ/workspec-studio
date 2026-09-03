import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import {
  Box,
  Boxes,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FileCheck2,
  GitCompareArrows,
  Landmark,
  Link2,
  Network,
  Pencil,
  PanelRightClose,
  PanelRightOpen,
  RadioTower,
  Trash2,
  UserRound,
  Waypoints,
  X,
} from 'lucide-react';
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
import { Layout, layoutPathFor } from '@workspec/c4-schema';
import {
  ARCHITECTURE_ELEMENT_KINDS, DEFAULT_ARCHITECTURE_SNAPSHOT, EMPTY_ARCHITECTURE_SNAPSHOT, buildArchitectureWorkspace, downloadBytes,
  bytesBase64, bytesDataUrl,
  loadArchitectureWorkspace, type ArchitectureElementKind, type ArchitectureRelationshipCategory, type ArchitectureSnapshot,
  type ArchitectureWorkspace,
} from './architecture-snapshot.js';
import type { WebMcpModelContext, WebMcpToolDefinition } from './cost-webmcp.js';
import { takePendingImport } from './pending-import.js';
import { navigate } from './router.js';
import {
  loadLeftSidebarCollapsed,
  loadRightSidebarCollapsed,
  loadStudioWorkspace,
  saveLeftSidebarCollapsed,
  saveRightSidebarCollapsed,
  saveStudioWorkspace,
} from './studio-storage.js';

const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio';
const MANAGED_C4 = ['.workspec/spec.yaml', '.workspec/system/', '.workspec/actors/', '.workspec/external-systems/', '.workspec/domains/', '.workspec/containers/', '.workspec/components/', '.workspec/databases/', '.workspec/queues/', '.workspec/diagrams/'];
const WORKFLOW = ['design', 'plan', 'compare', 'decision'] as const;
const studioRegistrationTails = new WeakMap<WebMcpModelContext, Promise<void>>();
type WorkflowStep = (typeof WORKFLOW)[number];
type ArchitectureLevel = 'context' | 'container' | 'component';
const EXAMPLE_CONTAINER_LAYOUT = [
  { id: 'operations-coordinator', x: 0, y: 80 },
  { id: 'utility-telemetry', x: 0, y: 470 },
  { id: 'weather-data', x: 0, y: 670 },
  { id: 'incident-management', x: 480, y: 80 },
  { id: 'field-operations', x: 900, y: 80 },
  { id: 'situational-intelligence', x: 480, y: 470 },
  { id: 'customer-communications', x: 900, y: 470 },
  { id: 'field-technician', x: 1420, y: 80 },
  { id: 'customer', x: 1420, y: 470 },
  { id: 'customer-messaging', x: 1420, y: 670 },
] as const;
const AUTHORING_COPY: Record<ArchitectureElementKind, { name: string; description: string }> = {
  actor: { name: 'e.g. Operations coordinator', description: 'How does this person use the system?' },
  'external-system': { name: 'e.g. Weather data service', description: 'What does this external system provide?' },
  domain: { name: 'e.g. Authentication', description: 'What business capability does this domain own?' },
  container: { name: 'e.g. Incident API', description: 'What responsibility does this container have?' },
  component: { name: 'e.g. Login API', description: 'What does this component do?' },
  database: { name: 'e.g. Incident database', description: 'What data does this database store?' },
  queue: { name: 'e.g. Dispatch events', description: 'What messages does this queue carry?' },
};
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

function registerStudioWebMcpTools(
  context: WebMcpModelContext,
  tools: readonly WebMcpToolDefinition[],
  signal: AbortSignal,
): Promise<void> {
  const prior = studioRegistrationTails.get(context) ?? Promise.resolve();
  const current = prior
    .catch(() => undefined)
    .then(async () => {
      if (signal.aborted) return;
      for (const tool of tools) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
    });
  studioRegistrationTails.set(context, current);
  const clearTail = () => {
    if (studioRegistrationTails.get(context) === current) studioRegistrationTails.delete(context);
  };
  void current.then(clearTail, clearTail);
  return current;
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

function money(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(amount);
}

interface DecisionStepProps {
  readonly decision: ReturnType<typeof DecisionArtifact.parse> | null;
  readonly editing: boolean;
  readonly options: readonly ProviderOption[];
  readonly selected: CloudProvider | undefined;
  readonly rationale: string;
  readonly requirementCount: number;
  readonly download: { href: string; filename: string } | null;
  readonly onSelect: (provider: CloudProvider) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onRecord: () => void;
  readonly onEdit: () => void;
  readonly onCancelEdit: () => void;
}

function DecisionStep(props: DecisionStepProps): ReactElement {
  const selectedOption = props.options.find((option) => option.provider === props.selected);
  if (props.decision && !props.editing) {
    return (
      <section className="journey-decision">
        <header className="tp-plan-header"><div><span>04 · Decision</span><h1>Architecture decision</h1><p>The selected platform is recorded as a durable, traceable ADR.</p></div></header>
        <div className="journey-decision-content journey-decision-recorded">
          <div className="journey-complete">
            <span className="journey-complete-icon"><CheckCircle2 size={20}/></span>
            <span className="journey-complete-copy"><small>Decision recorded</small><strong>{selectedOption?.name ?? 'Cloud platform'} selected</strong><span>The ADR and deployable provider files are ready.</span></span>
            <button type="button" className="journey-decision-edit" onClick={props.onEdit}><Pencil size={13}/> Edit decision</button>
            {props.download ? <a href={props.download.href} download={props.download.filename}><Download size={14}/> Download .workspec ZIP</a> : null}
          </div>
          <div className="ds-root journey-adr"><AdrView decisionRef="cloud-platform" decision={props.decision}/></div>
        </div>
      </section>
    );
  }

  return (
    <section className="journey-decision">
      <header className="tp-plan-header"><div><span>04 · Decision</span><h1>{props.editing ? 'Edit the decision' : 'Record the decision'}</h1><p>Confirm the provider, capture why it won, and generate the architecture decision record.</p></div></header>
      <div className="journey-decision-content">
        <div className="journey-decision-layout">
          <section className="journey-decision-options" aria-labelledby="decision-provider-title">
            <div className="journey-decision-section-head"><small>Selected option</small><h2 id="decision-provider-title">Cloud platform</h2><p>You can change the provider before recording the decision.</p></div>
            <div className="journey-decision-provider-list">
              {props.options.map((option) => {
                const active = option.provider === props.selected;
                return <button type="button" key={option.provider} className={active ? 'active' : ''} aria-pressed={active} onClick={() => props.onSelect(option.provider)}><span className="journey-decision-provider-icon"><Cloud size={17}/></span><span><strong>{option.name}</strong><small>{money(option.monthlyTotal)} USD / month</small></span>{active ? <Check size={16}/> : <i aria-hidden="true"/>}</button>;
              })}
            </div>
            {selectedOption ? <div className="journey-decision-summary"><div><small>Planning estimate</small><strong>{money(selectedOption.monthlyTotal)}</strong><span>USD per month</span></div><div><small>Requirements</small><strong>{props.requirementCount}</strong><span>across dev and prod</span></div></div> : null}
            <div className="journey-decision-creates"><small>Recording this decision creates</small><ul><li><FileCheck2 size={14}/><span><strong>Architecture decision record</strong><code>.workspec/decisions/cloud-platform.yaml</code></span></li><li><FileCheck2 size={14}/><span><strong>Deployable provider model</strong><code>topology, catalog, environments, and resources</code></span></li></ul></div>
          </section>
          <form className="journey-decision-form" onSubmit={(event) => { event.preventDefault(); props.onRecord(); }}>
            <div className="journey-decision-section-head"><small>Decision rationale</small><h2>Why is this the right choice?</h2><p>Capture the trade-offs and operational context future teams will need.</p></div>
            <label htmlFor="decision-rationale">Rationale</label>
            <textarea id="decision-rationale" rows={8} value={props.rationale} onChange={(event) => props.onRationaleChange(event.target.value)} placeholder="Explain why this option best fits the architecture, team, cost, and operational constraints."/>
            <div className="journey-decision-form-footer"><span>{props.rationale.trim().length} characters</span>{props.editing ? <button type="button" className="secondary" onClick={props.onCancelEdit}>Cancel</button> : null}<button type="submit" disabled={!props.selected || !props.rationale.trim()}><FileCheck2 size={14}/> {props.editing ? 'Update ADR' : 'Accept and generate ADR'}</button></div>
          </form>
        </div>
      </div>
    </section>
  );
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
  const [decisionEditing, setDecisionEditing] = useState(false);
  const [step, setStepState] = useState<WorkflowStep>(initialStep);
  const [furthestStep, setFurthestStep] = useState<WorkflowStep>('design');
  const [collapsed, setCollapsed] = useState(loadLeftSidebarCollapsed);
  const [elementsCollapsed, setElementsCollapsed] = useState(loadRightSidebarCollapsed);
  const [rightRailTab, setRightRailTab] = useState<'elements' | 'properties'>('elements');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementKind, setSelectedElementKind] = useState<'system' | ArchitectureElementKind | null>(null);
  const [systemSetupOpen, setSystemSetupOpen] = useState(true);
  const [systemName, setSystemName] = useState('');
  const [systemDescription, setSystemDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StudioStatus>('checking');
  const [statusLabel, setStatusLabel] = useState('WebMCP checking');
  const [authoring, setAuthoring] = useState(false);
  const [relationshipAuthoring, setRelationshipAuthoring] = useState(false);
  const [newKind, setNewKind] = useState<ArchitectureElementKind>('container');
  const [architectureLevel, setArchitectureLevel] = useState<ArchitectureLevel>('context');
  const [architectureLens, setArchitectureLens] = useState<'logical' | 'deployment'>('logical');
  const [architectureScope, setArchitectureScope] = useState('system-context');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTechnology, setNewTechnology] = useState('');
  const [logicalParentId, setLogicalParentId] = useState('');
  const [deploymentParentId, setDeploymentParentId] = useState('');
  const [relationshipFrom, setRelationshipFrom] = useState('');
  const [relationshipTo, setRelationshipTo] = useState('');
  const [relationshipDescription, setRelationshipDescription] = useState('');
  const [relationshipCategory, setRelationshipCategory] = useState<ArchitectureRelationshipCategory>('interaction');
  const [rationale, setRationale] = useState('Balances managed-service simplicity, capability fit, and estimated monthly cost.');

  function setStep(next: string): void {
    if (!WORKFLOW.includes(next as WorkflowStep)) return;
    const value = next as WorkflowStep;
    if (WORKFLOW.indexOf(value) > WORKFLOW.indexOf(furthestStep)) return;
    setStepState(value);
    navigate(`/studio/${value}`);
  }

  function advanceTo(next: WorkflowStep): void {
    if (WORKFLOW.indexOf(next) > WORKFLOW.indexOf(furthestStep)) setFurthestStep(next);
    setStepState(next);
    navigate(`/studio/${next}`);
  }

  function install(next: ArchitectureWorkspace, canonical: MemoryWorkspace, existingPlan?: InfrastructurePlan, persist = true): void {
    const planningElements = next.snapshot.elements.filter((item) => ['container', 'database', 'queue'].includes(item.kind));
    const derived = existingPlan ?? deriveInfrastructurePlan(next.snapshot.system.name, planningElements, ['dev', 'prod'], next.snapshot.relationships);
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
    setDecisionEditing(false);
    setSelected(undefined);
    setError(null);
    if (persist) saveStudioWorkspace(canonical.toZip());
  }

  async function startNew(): Promise<void> {
    const next = await buildArchitectureWorkspace(EMPTY_ARCHITECTURE_SNAPSHOT, 0, false);
    install(next, new MemoryWorkspace(textFileMap(next.files)), undefined, false);
    setFurthestStep('design');
    setStepState('design');
    setSystemName('');
    setSystemDescription('');
    setSystemSetupOpen(true);
    navigate('/studio/design');
  }

  async function loadExample(): Promise<void> {
    const next = await buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, (workspaceRef.current?.key ?? 0) + 1, false);
    install(next, new MemoryWorkspace(textFileMap(next.files)));
    await setDiagramLayout('container', EXAMPLE_CONTAINER_LAYOUT);
    setFurthestStep('design');
    setStepState('design');
    setSystemSetupOpen(false);
    navigate('/studio/design');
  }

  async function importFile(file: File): Promise<void> {
    setStatus('working'); setStatusLabel('Importing workspace');
    try {
      const canonical = new MemoryWorkspace(importWorkspecZip(new Uint8Array(await file.arrayBuffer())));
      let next: ArchitectureWorkspace;
      if (canonical.paths().some((path) => path.startsWith('.workspec/system/'))) {
        next = await loadArchitectureWorkspace(textFiles(canonical), (workspaceRef.current?.key ?? 0) + 1);
      } else {
        next = await buildArchitectureWorkspace(EMPTY_ARCHITECTURE_SNAPSHOT, (workspaceRef.current?.key ?? 0) + 1, true);
        for (const [path, content] of Object.entries(next.files)) canonical.writeText(path, content);
      }
      let existingPlan: InfrastructurePlan | undefined;
      if (canonical.exists('.workspec/plans/infrastructure.yaml')) existingPlan = InfrastructurePlanArtifact.parse(parse(canonical.readText('.workspec/plans/infrastructure.yaml')));
      install(next, canonical, existingPlan);
      setFurthestStep('design');
      setStepState('design');
      setSystemSetupOpen(false);
      navigate('/studio/design');
      const ready = Boolean(document.modelContext?.registerTool);
      setStatus(ready ? 'ready' : 'unsupported'); setStatusLabel(ready ? 'WebMCP ready' : 'WebMCP unavailable');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('error'); setStatusLabel('Import failed');
    }
  }

  async function restoreWorkspace(bytes: Uint8Array): Promise<void> {
    const canonical = new MemoryWorkspace(importWorkspecZip(bytes));
    const next = await loadArchitectureWorkspace(textFiles(canonical), 0);
    const existingPlan = canonical.exists('.workspec/plans/infrastructure.yaml')
      ? InfrastructurePlanArtifact.parse(parse(canonical.readText('.workspec/plans/infrastructure.yaml')))
      : undefined;
    install(next, canonical, existingPlan, false);
    setSystemSetupOpen(false);
    setStepState('design');
    navigate('/studio/design');
  }

  useEffect(() => {
    const pending = takePendingImport();
    if (pending) {
      void importFile(pending);
      return;
    }
    const saved = loadStudioWorkspace();
    if (saved) {
      void restoreWorkspace(saved).catch(() => void startNew());
      return;
    }
    void startNew();
  }, []);

  useEffect(() => saveLeftSidebarCollapsed(collapsed), [collapsed]);
  useEffect(() => saveRightSidebarCollapsed(elementsCollapsed), [elementsCollapsed]);

  const host = useMemo<C4StudioHost>(() => ({
    linkResolver: createInertLinkResolver(), capabilities: { editLayout: true },
    source: {
      async listFiles(dirPath) { return canonicalRef.current?.listFiles(dirPath) ?? []; },
      async readFile(path) { const canonical = canonicalRef.current; if (!canonical) throw new Error('Workspace is loading.'); return canonical.readText(path); },
      async writeFile(path, content) {
        const canonical = canonicalRef.current; const current = workspaceRef.current;
        if (!canonical || !current) throw new Error('The workspace is still loading.');
        canonical.writeText(path, content);
        saveStudioWorkspace(canonical.toZip());
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
    const planningElements = next.snapshot.elements.filter((item) => ['container', 'database', 'queue'].includes(item.kind));
    const freshPlan = deriveInfrastructurePlan(next.snapshot.system.name, planningElements, ['dev', 'prod'], next.snapshot.relationships);
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
    for (const path of canonical.paths()) {
      if (path.startsWith('.workspec/diagrams/.layout/')) continue;
      if (MANAGED_C4.some((prefix) => path === prefix || path.startsWith(prefix))) canonical.remove(path);
    }
    for (const [path, content] of Object.entries(next.files)) canonical.writeText(path, content);
    install(next, canonical, reconciledPlan);
    setSystemSetupOpen(false);
  }

  async function createSystem(): Promise<void> {
    const current = workspaceRef.current;
    const name = systemName.trim();
    if (!current || !name) return;
    const description = systemDescription.trim() || `The ${name} system.`;
    await replaceArchitecture({ ...current.snapshot, system: { name, description } });
  }

  async function addElement(): Promise<void> {
    const current = workspaceRef.current;
    if (!current || !newName.trim() || !newDescription.trim()) return;
    let id = slug(newName); let suffix = 2;
    while (current.snapshot.elements.some((item) => item.id === id)) id = `${slug(newName)}-${suffix++}`;
    await replaceArchitecture({
      ...current.snapshot,
      elements: [...current.snapshot.elements, {
        id,
        kind: newKind,
        name: newName.trim(),
        description: newDescription.trim(),
        ...(newTechnology.trim() ? { technology: newTechnology.trim() } : {}),
        ...(newKind === 'component' && logicalParentId ? { logicalParentId } : {}),
        ...(newKind === 'component' && deploymentParentId ? { deploymentParentId } : {}),
      }],
    });
    setNewName(''); setNewDescription(''); setNewTechnology(''); setAuthoring(false); setRightRailTab('elements');
  }

  function beginAdding(kind: ArchitectureElementKind): void {
    setNewKind(kind);
    setSelectedElementId(null);
    setSelectedElementKind(null);
    setNewName('');
    setNewDescription('');
    setNewTechnology('');
    if (kind === 'component') {
      const current = workspaceRef.current;
      const scope = current?.snapshot.elements.find((item) => item.id === architectureScope);
      setLogicalParentId(scope?.kind === 'domain' ? scope.id : current?.snapshot.elements.find((item) => item.kind === 'domain')?.id ?? '');
      setDeploymentParentId(scope?.kind === 'container' ? scope.id : current?.snapshot.elements.find((item) => item.kind === 'container')?.id ?? '');
    }
    setRelationshipAuthoring(false);
    setAuthoring(true);
    setRightRailTab('properties');
    setElementsCollapsed(false);
  }

  function selectElementForEditing(id: string, kind: 'system' | ArchitectureElementKind): void {
    const current = workspaceRef.current;
    if (!current) return;
    setAuthoring(false);
    setRelationshipAuthoring(false);
    setSelectedElementId(id);
    setSelectedElementKind(kind);
    if (kind === 'system') {
      setNewName(current.snapshot.system.name);
      setNewDescription(current.snapshot.system.description);
      setNewTechnology('');
      setLogicalParentId('');
      setDeploymentParentId('');
    } else {
      const element = current.snapshot.elements.find((item) => item.id === id && item.kind === kind);
      if (!element) return;
      setNewKind(element.kind);
      setNewName(element.name);
      setNewDescription(element.description);
      setNewTechnology(element.technology ?? '');
      setLogicalParentId(element.logicalParentId ?? '');
      setDeploymentParentId(element.deploymentParentId ?? '');
    }
    setRightRailTab('properties');
    setElementsCollapsed(false);
  }

  async function updateSelectedElement(): Promise<void> {
    const current = workspaceRef.current;
    if (!current || !selectedElementId || !selectedElementKind || !newName.trim() || !newDescription.trim()) return;
    if (selectedElementKind === 'system') {
      await replaceArchitecture({
        ...current.snapshot,
        system: { ...current.snapshot.system, name: newName.trim(), description: newDescription.trim() },
      });
      return;
    }
    await replaceArchitecture({
      ...current.snapshot,
      elements: current.snapshot.elements.map((element) => {
        if (element.id !== selectedElementId || element.kind !== selectedElementKind) return element;
        const updated = {
          ...element,
          name: newName.trim(),
          description: newDescription.trim(),
          ...(newTechnology.trim() ? { technology: newTechnology.trim() } : {}),
          ...(element.kind === 'component' && logicalParentId ? { logicalParentId } : {}),
          ...(element.kind === 'component' && deploymentParentId ? { deploymentParentId } : {}),
        };
        if (!newTechnology.trim()) delete updated.technology;
        if (element.kind === 'component' && !logicalParentId) delete updated.logicalParentId;
        if (element.kind === 'component' && !deploymentParentId) delete updated.deploymentParentId;
        return updated;
      }),
    });
  }

  async function addRelationship(): Promise<void> {
    const current = workspaceRef.current;
    if (!current || !relationshipFrom || !relationshipTo || relationshipFrom === relationshipTo || !relationshipDescription.trim()) return;
    await replaceArchitecture({
      ...current.snapshot,
      relationships: [...current.snapshot.relationships, {
        from: relationshipFrom,
        to: relationshipTo,
        description: relationshipDescription.trim(),
        category: relationshipCategory,
      }],
    });
    setRelationshipDescription('');
    setRelationshipAuthoring(false);
  }

  async function removeElement(id: string): Promise<void> {
    const current = workspaceRef.current; if (!current) return;
    await replaceArchitecture({
      ...current.snapshot,
      elements: current.snapshot.elements
        .filter((item) => item.id !== id)
        .map((item) => {
          if (item.kind !== 'component') return item;
          const { logicalParentId: logical, deploymentParentId: deployment, ...rest } = item;
          return {
            ...rest,
            ...(logical && logical !== id ? { logicalParentId: logical } : {}),
            ...(deployment && deployment !== id ? { deploymentParentId: deployment } : {}),
          };
        }),
      relationships: current.snapshot.relationships.filter((item) => item.from !== id && item.to !== id),
    });
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
    saveStudioWorkspace(canonical.toZip());
    const compared = compareProviders(next);
    planRef.current = next; optionsRef.current = compared;
    setPlan(next); setOptions(compared); setDecision(null); setDecisionEditing(false);
  }

  function changeRequirement(id: string, patch: Parameters<typeof updateRequirement>[2]): void {
    changeRequirements([{ id, patch }]);
  }

  async function setDiagramLayout(
    diagramSlug: string,
    positions: readonly { id: string; x: number; y: number; width?: number; height?: number }[],
    mode: 'replace' | 'merge' = 'replace',
  ): Promise<void> {
    const canonical = canonicalRef.current;
    const current = workspaceRef.current;
    if (!canonical || !current) throw new Error('The workspace is still loading.');
    const diagram = current.model.diagrams.find((item) => item.slug === diagramSlug);
    if (!diagram) throw new Error(`Unknown diagram: ${diagramSlug}`);
    const knownNodeIds = new Set([
      ...(diagram.view?.nodes.map((node) => node.nodeId) ?? []),
      ...(diagram.lensViews?.logical.nodes.map((node) => node.nodeId) ?? []),
      ...(diagram.lensViews?.deployment.nodes.map((node) => node.nodeId) ?? []),
    ]);
    const path = layoutPathFor(diagramSlug);
    const prior = mode === 'merge' && canonical.exists(path)
      ? Layout.parse(parse(canonical.readText(path)))
      : Layout.parse({ version: 1, nodes: {} });
    const nodes = { ...prior.nodes };
    for (const position of positions) {
      if (!knownNodeIds.has(position.id)) throw new Error(`Unknown node ${position.id} in diagram ${diagramSlug}.`);
      nodes[position.id] = {
        x: position.x,
        y: position.y,
        ...(position.width !== undefined ? { width: position.width } : {}),
        ...(position.height !== undefined ? { height: position.height } : {}),
      };
    }
    const layout = Layout.parse({ ...prior, nodes });
    canonical.writeText(path, `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/layout.schema.json\n${stringify(layout, { lineWidth: 0 })}`);
    saveStudioWorkspace(canonical.toZip());
    const reloaded = await loadArchitectureWorkspace(textFiles(canonical), current.key + 1);
    const next = { ...reloaded, snapshot: current.snapshot, files: textFiles(canonical), imported: current.imported };
    workspaceRef.current = next;
    setWorkspace(next);
  }

  function recordDecision(provider = selected, reason = rationale): ReturnType<typeof DecisionArtifact.parse> {
    const canonical = canonicalRef.current; const currentPlan = planRef.current;
    const option = optionsRef.current.find((item) => item.provider === provider);
    if (!canonical || !currentPlan || !option) throw new Error('Select Azure or AWS before recording the decision.');
    for (const candidate of ['azure', 'aws'] as const) {
      for (const path of [`.workspec/decisions/catalogs/${candidate}.yaml`, `.workspec/topologies/${candidate}.yaml`]) {
        if (canonical.exists(path)) canonical.remove(path);
      }
    }
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
    saveStudioWorkspace(canonical.toZip());
    setDecision(artifact); setDecisionEditing(false); setSelected(option.provider); advanceTo('decision');
    return artifact;
  }

  const actionsRef = useRef({ replaceArchitecture, changeRequirements, recordDecision, setDiagramLayout });
  actionsRef.current = { replaceArchitecture, changeRequirements, recordDecision, setDiagramLayout };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) { setStatus('unsupported'); setStatusLabel('WebMCP unavailable'); return; }
    const lifecycle = new AbortController();
    const tools: WebMcpToolDefinition[] = [
      { name: 'get_workspec_workspace_summary', title: 'Inspect WorkSpec workspace', description: 'Read the current architecture, infrastructure requirements, provider comparison, and generated files.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return { project: workspaceRef.current?.snapshot.system.name, elements: workspaceRef.current?.snapshot.elements.length ?? 0, requirements: planRef.current?.spec.requirements.length ?? 0, providers: optionsRef.current.map((item) => ({ provider: item.provider, monthlyTotal: item.monthlyTotal })), files: canonicalRef.current?.paths() ?? [] }; } },
      { name: 'set_c4_architecture', title: 'Set C4 architecture', description: 'Replace the visible C4 architecture with a complete system, elements, and relationships snapshot, then regenerate the infrastructure plan.', inputSchema: { type: 'object', properties: { snapshot: { type: 'object' } }, required: ['snapshot'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { await actionsRef.current.replaceArchitecture(input.snapshot as ArchitectureSnapshot); return { updated: true, elements: workspaceRef.current?.snapshot.elements.length ?? 0, requirements: planRef.current?.spec.requirements.length ?? 0 }; } },
      { name: 'get_c4_layout', title: 'Inspect C4 diagram layout', description: 'Read the available nodes and currently pinned positions for a C4 diagram without changing the architecture.', inputSchema: { type: 'object', properties: { diagramSlug: { type: 'string' } }, required: ['diagramSlug'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(input) { const current = workspaceRef.current; const canonical = canonicalRef.current; if (!current || !canonical) throw new Error('The workspace is still loading.'); const diagramSlug = String(input.diagramSlug); const diagram = current.model.diagrams.find((item) => item.slug === diagramSlug); if (!diagram) throw new Error(`Unknown diagram: ${diagramSlug}`); const path = layoutPathFor(diagramSlug); const nodes = [...new Map([...(diagram.view?.nodes ?? []), ...(diagram.lensViews?.logical.nodes ?? []), ...(diagram.lensViews?.deployment.nodes ?? [])].map((node) => [node.nodeId, { id: node.nodeId, kind: node.kind, name: node.title }])).values()]; return { diagramSlug, type: diagram.type, nodes, layout: canonical.exists(path) ? Layout.parse(parse(canonical.readText(path))) : { version: 1, nodes: {} } }; } },
      { name: 'set_c4_layout', title: 'Arrange C4 diagram', description: 'Pin node positions for a diagram without changing architecture semantics. Use replace to define the curated layout or merge to move selected nodes.', inputSchema: { type: 'object', properties: { diagramSlug: { type: 'string' }, mode: { enum: ['replace', 'merge'] }, positions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } }, required: ['id', 'x', 'y'], additionalProperties: false } } }, required: ['diagramSlug', 'positions'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { if (!Array.isArray(input.positions)) throw new Error('positions must be an array.'); const positions = input.positions.map((raw) => { const item = raw as Record<string, unknown>; return { id: String(item.id), x: Number(item.x), y: Number(item.y), ...(item.width !== undefined ? { width: Number(item.width) } : {}), ...(item.height !== undefined ? { height: Number(item.height) } : {}) }; }); await actionsRef.current.setDiagramLayout(String(input.diagramSlug), positions, input.mode === 'merge' ? 'merge' : 'replace'); return { updated: positions.length, diagramSlug: input.diagramSlug, persisted: true }; } },
      { name: 'update_infrastructure_requirements', title: 'Update infrastructure requirements', description: 'Batch-update sizing, quantity, availability, or notes for provider-neutral requirements and refresh estimates.', inputSchema: { type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, size: { enum: ['small', 'medium', 'large'] }, quantity: { type: 'integer', minimum: 1 }, availability: { enum: ['standard', 'high'] }, notes: { type: 'string' } }, required: ['id'], additionalProperties: false } } }, required: ['changes'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { if (!Array.isArray(input.changes)) throw new Error('changes must be an array'); const changes = input.changes.map((raw) => { const change = raw as Record<string, unknown>; const id = String(change.id ?? ''); const { id: _id, ...patch } = change; return { id, patch }; }); actionsRef.current.changeRequirements(changes); return { updated: changes.length, providers: optionsRef.current.map((item) => ({ provider: item.provider, monthlyTotal: item.monthlyTotal })) }; } },
      { name: 'compare_cloud_providers', title: 'Compare Azure and AWS', description: 'Read Azure and AWS service mappings and monthly estimates for the current provider-neutral plan.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return { options: optionsRef.current }; } },
      { name: 'record_cloud_decision', title: 'Record cloud decision', description: 'Accept Azure or AWS, materialize its catalog, resources and topology, and write the ADR into the visible workspace.', inputSchema: { type: 'object', properties: { provider: { enum: ['azure', 'aws'] }, rationale: { type: 'string', minLength: 1 } }, required: ['provider', 'rationale'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const artifact = actionsRef.current.recordDecision(input.provider as CloudProvider, String(input.rationale)); return { recorded: true, decision: artifact.metadata.slug, provider: input.provider, files: canonicalRef.current?.paths() ?? [] }; } },
      { name: 'export_workspec_bundle', title: 'Export WorkSpec bundle', description: 'Read the complete current .workspec workspace as a base64-encoded ZIP so an agent can save or hand off the result without relying on a browser download event.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { const canonical = canonicalRef.current; const current = workspaceRef.current; if (!canonical || !current) throw new Error('The workspace is still loading.'); const bytes = canonical.toZip(); if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('The ZIP is too large for WebMCP export; use the visible download link.'); return { filename: `${slug(current.snapshot.system.name)}-workspec.zip`, mediaType: 'application/zip', encoding: 'base64', byteLength: bytes.byteLength, data: bytesBase64(bytes) }; } },
    ];
    setStatus('checking'); setStatusLabel('WebMCP checking');
    void registerStudioWebMcpTools(context, tools, lifecycle.signal)
      .then(() => {
        if (lifecycle.signal.aborted) return;
        setStatus('ready'); setStatusLabel('WebMCP ready');
      })
      .catch(() => {
        if (lifecycle.signal.aborted) return;
        lifecycle.abort();
        setStatus('error'); setStatusLabel('WebMCP error');
      });
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
  const hasDesign = (plan?.spec.requirements.length ?? 0) > 0;
  const furthestIndex = WORKFLOW.indexOf(furthestStep);
  const workflowSteps = STEPS.map((item, index) => ({
    ...item,
    complete: index < furthestIndex,
    disabled: index > furthestIndex || (index > 0 && !hasDesign),
  }));
  const relationshipEndpoints = workspace ? [
    ...(architectureLevel === 'context' ? [{ id: 'system', name: workspace.snapshot.system.name, kind: 'system' }] : []),
    ...workspace.snapshot.elements
      .filter((item) => {
        if (architectureLevel === 'context') return item.kind === 'actor' || item.kind === 'external-system';
        if (architectureLevel === 'component') {
          return item.kind === 'component' && (item.logicalParentId === architectureScope || item.deploymentParentId === architectureScope);
        }
        return item.kind === 'actor' || item.kind === 'external-system' ||
          (architectureLens === 'logical' ? item.kind === 'domain' : ['container', 'database', 'queue'].includes(item.kind));
      })
      .map((item) => ({ id: item.id, name: item.name, kind: item.kind })),
  ] : [];

  return (
    <StudioShell projectName={workspace?.snapshot.system.name ?? 'New WorkSpec project'} steps={workflowSteps} activeStep={step} onStepChange={setStep} collapsed={collapsed} onCollapsedChange={setCollapsed} status={status} statusLabel={statusLabel} onHome={() => navigate('/')} onImport={() => importRef.current?.click()} onLoadExample={() => void loadExample()} onDownload={download} repoUrl={REPO_URL}>
      <input ref={importRef} hidden type="file" accept=".zip,application/zip" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }} />
      {error ? <div className="journey-error" role="alert">{error}</div> : null}
      {systemSetupOpen ? (
        <div className="journey-system-setup-backdrop">
          <form className="journey-system-setup" role="dialog" aria-modal="true" aria-labelledby="system-setup-title" onSubmit={(event) => { event.preventDefault(); void createSystem(); }}>
            <span>Start a new architecture</span>
            <h1 id="system-setup-title">Name your system</h1>
            <p>Every C4 model starts with exactly one system. You can add people, services, data stores, and dependencies next.</p>
            <label>System name<input autoFocus required aria-label="System name" placeholder="e.g. Customer billing platform" value={systemName} onChange={(event) => setSystemName(event.target.value)}/></label>
            <label>Description <small>Optional</small><textarea aria-label="System description" rows={3} placeholder="What does this system do?" value={systemDescription} onChange={(event) => setSystemDescription(event.target.value)}/></label>
            <button type="submit" disabled={!workspace || !systemName.trim()}>Create system</button>
          </form>
        </div>
      ) : null}
      {step === 'design' ? (
        <section className="journey-design" aria-label="Design architecture">
          <div className="journey-stage-head"><div><span>01 · Design</span><h1>Design the application</h1><p>Shape the C4 model. Every deployable element becomes a traceable infrastructure requirement.</p></div></div>
          <div className={`journey-design-grid${elementsCollapsed ? ' journey-design-grid-rail-collapsed' : ''}`}>
            <div className="journey-canvas">
              {workspace ? <C4Explorer key={workspace.key} model={workspace.model} host={host} theme={theme} initialDiagramSlug={architectureScope} initialLens={architectureLens} canvasChrome showDetails={false} onLensChange={setArchitectureLens} onSelectionChange={(selection) => {
                if (!selection || !selection.slug || !selection.kind) {
                  setSelectedElementId(null);
                  setSelectedElementKind(null);
                  if (!authoring) setRightRailTab('elements');
                  return;
                }
                if (selection.kind === 'system' || ARCHITECTURE_ELEMENT_KINDS.includes(selection.kind as ArchitectureElementKind)) {
                  selectElementForEditing(selection.slug, selection.kind as 'system' | ArchitectureElementKind);
                }
              }} onDiagramChange={(diagram) => { setArchitectureScope(diagram.slug); setArchitectureLevel(diagram.type === 'c4-container' ? 'container' : diagram.type === 'c4-component' ? 'component' : 'context'); setAuthoring(false); setRelationshipAuthoring(false); }}/> : <p>Building the architecture model…</p>}
              <div className="journey-canvas-palette" role="toolbar" aria-label="Add architecture element">
                {architectureLevel === 'context' ? <>
                  <button type="button" aria-label="Add Person" title="Add Person" className={authoring && newKind === 'actor' ? 'active' : ''} onClick={() => beginAdding('actor')}><UserRound size={16}/></button>
                  <button type="button" aria-label="Add External system" title="Add External system" className={authoring && newKind === 'external-system' ? 'active' : ''} onClick={() => beginAdding('external-system')}><RadioTower size={16}/></button>
                </> : architectureLevel === 'component' ? <>
                  <button type="button" aria-label="Add Component" title="Add Component" className={authoring && newKind === 'component' ? 'active' : ''} onClick={() => beginAdding('component')}><Boxes size={16}/></button>
                </> : architectureLens === 'logical' ? <>
                  <button type="button" aria-label="Add Domain" title="Add logical domain" className={authoring && newKind === 'domain' ? 'active' : ''} onClick={() => beginAdding('domain')}><Network size={16}/></button>
                </> : <>
                  <button type="button" aria-label="Add Container" title="Add Container" className={authoring && newKind === 'container' ? 'active' : ''} onClick={() => beginAdding('container')}><Box size={16}/></button>
                  <button type="button" aria-label="Add Database" title="Add Database" className={authoring && newKind === 'database' ? 'active' : ''} onClick={() => beginAdding('database')}><Database size={16}/></button>
                  <button type="button" aria-label="Add Queue" title="Add Queue" className={authoring && newKind === 'queue' ? 'active' : ''} onClick={() => beginAdding('queue')}><Waypoints size={16}/></button>
                </>}
                <i aria-hidden="true" />
                <button type="button" aria-label="Add Connection" title="Add Connection" className={relationshipAuthoring ? 'active' : ''} disabled={relationshipEndpoints.length < 2} onClick={() => { setAuthoring(false); setRelationshipFrom(relationshipEndpoints[0]?.id ?? ''); setRelationshipTo(relationshipEndpoints[1]?.id ?? ''); setRelationshipDescription(''); setRelationshipCategory('interaction'); setRelationshipAuthoring(true); }}><Link2 size={16}/></button>
              </div>
              {relationshipAuthoring ? (
                <form className="journey-author-panel" onSubmit={(event) => { event.preventDefault(); void addRelationship(); }}>
                  <header><strong>Add connection</strong><button type="button" aria-label="Close add connection" onClick={() => setRelationshipAuthoring(false)}><X size={15}/></button></header>
                  <label>From<select aria-label="Connection from" value={relationshipFrom} onChange={(event) => setRelationshipFrom(event.target.value)}>{relationshipEndpoints.map((item) => <option key={item.id} value={item.id}>{item.kind.replace('-', ' ')} · {item.name}</option>)}</select></label>
                  <label>To<select aria-label="Connection to" value={relationshipTo} onChange={(event) => setRelationshipTo(event.target.value)}>{relationshipEndpoints.map((item) => <option key={item.id} value={item.id}>{item.kind.replace('-', ' ')} · {item.name}</option>)}</select></label>
                  <label>Type<select aria-label="Connection type" value={relationshipCategory} onChange={(event) => setRelationshipCategory(event.target.value as ArchitectureRelationshipCategory)}><option value="interaction">Interaction</option><option value="data">Data</option><option value="dependency">Dependency</option></select></label>
                  <label>Description<input aria-label="Connection description" placeholder="e.g. Reports outages and tracks restoration" value={relationshipDescription} onChange={(event) => setRelationshipDescription(event.target.value)}/></label>
                  <button type="submit" disabled={!relationshipFrom || !relationshipTo || relationshipFrom === relationshipTo || !relationshipDescription.trim()}>Add connection</button>
                </form>
              ) : null}
            </div>
            <aside className={`journey-element-list${elementsCollapsed ? ' journey-element-list-collapsed' : ''}`}>
              <header>
                {!elementsCollapsed ? <div className="journey-rail-tabs" role="tablist" aria-label="Architecture sidebar">
                  <button type="button" role="tab" aria-selected={rightRailTab === 'elements'} className={rightRailTab === 'elements' ? 'active' : ''} onClick={() => setRightRailTab('elements')}>Elements <span>{(workspace?.snapshot.elements.length ?? 0) + 1}</span></button>
                  {(authoring || selectedElementId) ? <button type="button" role="tab" aria-selected={rightRailTab === 'properties'} className={rightRailTab === 'properties' ? 'active' : ''} onClick={() => setRightRailTab('properties')}>Properties</button> : null}
                </div> : <strong>Architecture sidebar</strong>}
                <button type="button" className="journey-elements-collapse" aria-label={elementsCollapsed ? 'Expand model elements' : 'Collapse model elements'} title={elementsCollapsed ? 'Expand model elements' : 'Collapse model elements'} onClick={() => setElementsCollapsed(!elementsCollapsed)}>
                  {elementsCollapsed ? <PanelRightOpen size={15}/> : <PanelRightClose size={15}/>}
                </button>
              </header>
              {!elementsCollapsed && rightRailTab === 'elements' ? <div className="journey-element-list-body">
                {workspace ? <div className="journey-element-row"><button type="button" className="journey-element-select" onClick={() => selectElementForEditing('main-system', 'system')}><small>system</small><strong>{workspace.snapshot.system.name}</strong></button></div> : null}
                {workspace?.snapshot.elements.map((item) => <div className="journey-element-row" key={item.id}><button type="button" className="journey-element-select" onClick={() => selectElementForEditing(item.id, item.kind)}><small>{item.kind}</small><strong>{item.name}</strong></button><button type="button" aria-label={`Remove ${item.name}`} onClick={() => void removeElement(item.id)}><Trash2 size={14}/></button></div>)}
                <button type="button" className="journey-next" disabled={!hasDesign} onClick={() => advanceTo('plan')}>Build infrastructure plan →</button>
              </div> : null}
              {!elementsCollapsed && rightRailTab === 'properties' && (authoring || selectedElementId) ? <form className="journey-properties-form" onSubmit={(event) => { event.preventDefault(); void (authoring ? addElement() : updateSelectedElement()); }}>
                <div className="journey-properties-heading"><small>{authoring ? 'New element' : 'Selected element'}</small><strong>{authoring ? `Add ${newKind === 'actor' ? 'person' : newKind.replace('-', ' ')}` : selectedElementKind?.replace('-', ' ')}</strong></div>
                <label>Name<input autoFocus aria-label="Element name" placeholder={authoring ? AUTHORING_COPY[newKind].name : undefined} value={newName} onChange={(event) => setNewName(event.target.value)}/></label>
                <label>Description<textarea aria-label="Element description" rows={4} placeholder={authoring ? AUTHORING_COPY[newKind].description : undefined} value={newDescription} onChange={(event) => setNewDescription(event.target.value)}/></label>
                {(authoring ? !['actor', 'domain'].includes(newKind) : selectedElementKind !== 'system' && selectedElementKind !== 'actor' && selectedElementKind !== 'domain') ? <label>Technology <small>Optional</small><input aria-label="Element technology" placeholder="e.g. React, .NET, PostgreSQL" value={newTechnology} onChange={(event) => setNewTechnology(event.target.value)}/></label> : null}
                {(authoring ? newKind : selectedElementKind) === 'component' ? <>
                  <label>Logical domain<select aria-label="Logical domain" value={logicalParentId} onChange={(event) => setLogicalParentId(event.target.value)}><option value="">Not assigned yet</option>{workspace?.snapshot.elements.filter((item) => item.kind === 'domain').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Deployment container<select aria-label="Deployment container" value={deploymentParentId} onChange={(event) => setDeploymentParentId(event.target.value)}><option value="">Not assigned yet</option>{workspace?.snapshot.elements.filter((item) => item.kind === 'container').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </> : null}
                {!authoring && selectedElementKind !== 'system' && selectedElementId ? <div className="journey-property-meta"><span>Identifier</span><code>{selectedElementId}</code></div> : null}
                <div className="journey-properties-actions">
                  {!authoring && selectedElementKind !== 'system' && selectedElementId ? <button type="button" className="danger" aria-label={`Remove ${newName}`} onClick={() => { void removeElement(selectedElementId); setSelectedElementId(null); setSelectedElementKind(null); setRightRailTab('elements'); }}><Trash2 size={14}/> Delete</button> : null}
                  <button type="button" className="secondary" aria-label={authoring ? 'Close add element' : 'Cancel property changes'} onClick={() => { setAuthoring(false); setSelectedElementId(null); setSelectedElementKind(null); setRightRailTab('elements'); }}>Cancel</button>
                  <button type="submit" disabled={!newName.trim() || !newDescription.trim()}>{authoring ? 'Add to model' : 'Save changes'}</button>
                </div>
              </form> : null}
            </aside>
          </div>
        </section>
      ) : step === 'plan' && plan ? <InfrastructurePlanEditor plan={plan} onChange={changeRequirement} onContinue={() => advanceTo('compare')}/>
      : step === 'compare' ? <ProviderComparison options={options} {...(selected ? { selected } : {})} onSelect={setSelected} onContinue={() => advanceTo('decision')}/>
      : <DecisionStep decision={decision} editing={decisionEditing} options={options} selected={selected} rationale={rationale} requirementCount={plan?.spec.requirements.length ?? 0} download={completeDownload} onSelect={setSelected} onRationaleChange={setRationale} onRecord={() => { recordDecision(); }} onEdit={() => setDecisionEditing(true)} onCancelEdit={() => setDecisionEditing(false)}/>}
    </StudioShell>
  );
}
