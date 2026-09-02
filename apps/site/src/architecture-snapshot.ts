import { strToU8, zipSync } from 'fflate';
import { stringify } from 'yaml';
import { layoutModel } from '@workspec/c4-layout';
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import type { C4Model } from '@workspec/c4-model';
import {
  ActorElement,
  C4Element,
  Diagram,
  ExternalSystemElement,
  Spec,
  SystemElement,
} from '@workspec/c4-schema';
import { renderSvg } from '@workspec/c4-ui';
import type { ThemeName } from '@workspec/c4-ui';

import type { WebMcpToolDefinition } from './cost-webmcp.js';

export const ARCHITECTURE_ELEMENT_KINDS = [
  'actor',
  'external-system',
  'container',
  'database',
  'queue',
] as const;

export type ArchitectureElementKind = (typeof ARCHITECTURE_ELEMENT_KINDS)[number];
export type ArchitectureRelationshipCategory = 'interaction' | 'data' | 'dependency';

export interface ArchitectureElementInput {
  id: string;
  kind: ArchitectureElementKind;
  name: string;
  description: string;
  technology?: string;
  tags?: string[];
}

export interface ArchitectureRelationshipInput {
  from: string;
  to: string;
  description: string;
  category?: ArchitectureRelationshipCategory;
}

export interface ArchitectureSnapshot {
  system: { name: string; description: string; summary?: string };
  elements: ArchitectureElementInput[];
  relationships: ArchitectureRelationshipInput[];
}

export interface ArchitectureWorkspace {
  key: number;
  snapshot: ArchitectureSnapshot;
  files: Record<string, string>;
  model: C4Model;
  imported: boolean;
}

export interface ArchitectureActivity {
  kind: 'checking' | 'unsupported' | 'ready' | 'inspected' | 'previewed' | 'applied' | 'error';
  title: string;
  detail: string;
}

export class ArchitectureSnapshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ArchitectureSnapshotError';
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ELEMENTS = 100;
const MAX_RELATIONSHIPS = 250;

const STYLE_SPEC = Spec.parse({
  type: 'style',
  version: 2,
  elements: {
    actor: { accent: '#4A90D9', icon: 'user', shape: 'box' },
    'external-system': {
      accent: '#64748b',
      icon: 'external-link',
      shape: 'box',
      variant: 'external',
    },
    container: { accent: '#8b5cf6', icon: 'box', shape: 'box' },
    database: { accent: '#10b981', icon: 'database', shape: 'cylinder' },
    queue: { accent: '#f59e0b', icon: 'queue', shape: 'box' },
  },
  connections: {
    interaction: { accent: '#64748b', style: 'solid' },
    data: { accent: '#10b981', style: 'solid' },
    dependency: { accent: '#8b5cf6', style: 'dashed' },
  },
});

export const DEFAULT_ARCHITECTURE_SNAPSHOT: ArchitectureSnapshot = {
  system: {
    name: 'Fieldstate Ledger',
    summary: 'A small event-driven billing platform.',
    description:
      'Captures billable events, maintains an authoritative ledger, and sends payments to an external gateway.',
  },
  elements: [
    {
      id: 'platform-architect',
      kind: 'actor',
      name: 'Platform Architect',
      description: 'Explores the system and plans architectural change.',
    },
    {
      id: 'payment-gateway',
      kind: 'external-system',
      name: 'Payment Gateway',
      description: 'Authorises and settles customer payments.',
    },
    {
      id: 'web-app',
      kind: 'container',
      name: 'Operations Web App',
      description: 'Lets operators inspect accounts, invoices, and payment state.',
      technology: 'React',
    },
    {
      id: 'ledger-api',
      kind: 'container',
      name: 'Ledger API',
      description: 'Coordinates ledger commands and exposes account state.',
      technology: 'Node.js',
    },
    {
      id: 'primary-db',
      kind: 'database',
      name: 'Primary Database',
      description: 'Stores accounts, ledger entries, and payment state.',
      technology: 'PostgreSQL',
    },
    {
      id: 'event-bus',
      kind: 'queue',
      name: 'Event Bus',
      description: 'Distributes durable billing and payment events.',
      technology: 'Azure Service Bus',
    },
  ],
  relationships: [
    {
      from: 'platform-architect',
      to: 'web-app',
      description: 'Inspects account and payment state',
      category: 'interaction',
    },
    {
      from: 'web-app',
      to: 'ledger-api',
      description: 'Calls HTTPS APIs',
      category: 'interaction',
    },
    {
      from: 'ledger-api',
      to: 'primary-db',
      description: 'Reads and writes ledger state',
      category: 'data',
    },
    {
      from: 'ledger-api',
      to: 'event-bus',
      description: 'Publishes billing events',
      category: 'data',
    },
    {
      from: 'ledger-api',
      to: 'payment-gateway',
      description: 'Requests payment authorisation',
      category: 'interaction',
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new ArchitectureSnapshotError('invalid_input', `${path} must be an object.`);
  return value;
}

function requireString(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ArchitectureSnapshotError('invalid_input', `${path} must be a non-empty string.`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      `${path} must be at most ${maximum} characters.`,
    );
  }
  return result;
}

function optionalString(value: unknown, path: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, path, maximum);
}

function assertKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra !== undefined) {
    throw new ArchitectureSnapshotError('invalid_input', `${path}.${extra} is not supported.`);
  }
}

export function parseArchitectureSnapshot(input: unknown): ArchitectureSnapshot {
  const root = requireRecord(input, 'snapshot');
  assertKeys(root, ['system', 'elements', 'relationships'], 'snapshot');
  const systemValue = requireRecord(root.system, 'snapshot.system');
  assertKeys(systemValue, ['name', 'description', 'summary'], 'snapshot.system');
  const summary = optionalString(systemValue.summary, 'snapshot.system.summary', 240);
  const system = {
    name: requireString(systemValue.name, 'snapshot.system.name', 120),
    description: requireString(systemValue.description, 'snapshot.system.description', 1_000),
    ...(summary !== undefined ? { summary } : {}),
  };
  if (!Array.isArray(root.elements) || root.elements.length === 0) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      'snapshot.elements must contain at least one element.',
    );
  }
  if (root.elements.length > MAX_ELEMENTS) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      `snapshot.elements is limited to ${MAX_ELEMENTS} items.`,
    );
  }
  const seen = new Set<string>();
  const elements = root.elements.map((raw, index): ArchitectureElementInput => {
    const value = requireRecord(raw, `snapshot.elements[${index}]`);
    assertKeys(
      value,
      ['id', 'kind', 'name', 'description', 'technology', 'tags'],
      `snapshot.elements[${index}]`,
    );
    const id = requireString(value.id, `snapshot.elements[${index}].id`, 80);
    if (!SLUG_PATTERN.test(id)) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${id} must be a lowercase kebab-case id.`,
      );
    }
    if (id === 'system' || id === '__system__' || seen.has(id)) {
      throw new ArchitectureSnapshotError('invalid_input', `${id} is reserved or duplicated.`);
    }
    seen.add(id);
    if (!ARCHITECTURE_ELEMENT_KINDS.includes(value.kind as ArchitectureElementKind)) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${String(value.kind)} is not a supported element kind.`,
      );
    }
    const kind = value.kind as ArchitectureElementKind;
    const technology = optionalString(
      value.technology,
      `snapshot.elements[${index}].technology`,
      160,
    );
    if ((kind === 'actor' || kind === 'external-system') && technology !== undefined) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${kind} elements do not accept technology.`,
      );
    }
    let tags: string[] | undefined;
    if (value.tags !== undefined) {
      if (!Array.isArray(value.tags) || value.tags.length > 20) {
        throw new ArchitectureSnapshotError(
          'invalid_input',
          `snapshot.elements[${index}].tags must be an array of at most 20 strings.`,
        );
      }
      tags = value.tags.map((tag, tagIndex) =>
        requireString(tag, `snapshot.elements[${index}].tags[${tagIndex}]`, 64),
      );
    }
    return {
      id,
      kind,
      name: requireString(value.name, `snapshot.elements[${index}].name`, 120),
      description: requireString(
        value.description,
        `snapshot.elements[${index}].description`,
        1_000,
      ),
      ...(technology !== undefined ? { technology } : {}),
      ...(tags !== undefined ? { tags } : {}),
    };
  });
  if (!Array.isArray(root.relationships)) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      'snapshot.relationships must be an array.',
    );
  }
  if (root.relationships.length > MAX_RELATIONSHIPS) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      `snapshot.relationships is limited to ${MAX_RELATIONSHIPS} items.`,
    );
  }
  const endpoints = new Set(['system', ...seen]);
  const relationships = root.relationships.map((raw, index): ArchitectureRelationshipInput => {
    const value = requireRecord(raw, `snapshot.relationships[${index}]`);
    assertKeys(
      value,
      ['from', 'to', 'description', 'category'],
      `snapshot.relationships[${index}]`,
    );
    const from = requireString(value.from, `snapshot.relationships[${index}].from`, 80);
    const to = requireString(value.to, `snapshot.relationships[${index}].to`, 80);
    if (!endpoints.has(from) || !endpoints.has(to)) {
      throw new ArchitectureSnapshotError(
        'invalid_endpoint',
        `Relationship ${from} -> ${to} references an unknown element.`,
      );
    }
    if (from === to)
      throw new ArchitectureSnapshotError(
        'invalid_relationship',
        'A relationship cannot connect an element to itself.',
      );
    const category = value.category ?? 'interaction';
    if (!['interaction', 'data', 'dependency'].includes(String(category))) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${String(category)} is not a supported relationship category.`,
      );
    }
    return {
      from,
      to,
      description: requireString(
        value.description,
        `snapshot.relationships[${index}].description`,
        240,
      ),
      category: category as ArchitectureRelationshipCategory,
    };
  });
  return { system, elements, relationships };
}

const DIRECTORY_BY_KIND: Record<ArchitectureElementKind, string> = {
  actor: 'actors',
  'external-system': 'external-systems',
  container: 'containers',
  database: 'databases',
  queue: 'queues',
};

function yaml(value: unknown, schemaUrl: string): string {
  return `# yaml-language-server: $schema=${schemaUrl}\n${stringify(value, { lineWidth: 0 })}`;
}

function typedNode(element: ArchitectureElementInput): Record<string, string> {
  return { [element.kind]: element.id };
}

function buildFiles(snapshot: ArchitectureSnapshot): Record<string, string> {
  const files: Record<string, string> = {
    '.workspec/spec.yaml': yaml(
      STYLE_SPEC,
      'https://schema.workspec.io/v1alpha1/c4/spec.schema.json',
    ),
    '.workspec/system/main-system.yaml': yaml(
      SystemElement.parse({
        title: snapshot.system.name,
        description: snapshot.system.description,
        ...(snapshot.system.summary !== undefined ? { summary: snapshot.system.summary } : {}),
        phase: 'discovery',
      }),
      'https://schema.workspec.io/v1alpha1/c4/system.schema.json',
    ),
  };
  for (const element of snapshot.elements) {
    const data = {
      ...(element.kind === 'container' || element.kind === 'database' || element.kind === 'queue'
        ? { type: element.kind }
        : {}),
      title: element.name,
      description: element.description,
      ...(element.technology !== undefined ? { technology: element.technology } : {}),
      ...(element.tags !== undefined ? { tags: element.tags } : {}),
    };
    const parsed =
      element.kind === 'actor'
        ? ActorElement.parse(data)
        : element.kind === 'external-system'
          ? ExternalSystemElement.parse(data)
          : C4Element.parse(data);
    files[`.workspec/${DIRECTORY_BY_KIND[element.kind]}/${element.id}.yaml`] = yaml(
      parsed,
      `https://schema.workspec.io/v1alpha1/c4/${element.kind}.schema.json`,
    );
  }

  const internalKinds = new Set<ArchitectureElementKind>(['container', 'database', 'queue']);
  const kindById = new Map(snapshot.elements.map((element) => [element.id, element.kind]));
  const contextElements = snapshot.elements.filter((element) => !internalKinds.has(element.kind));
  const contextEdgeKeys = new Set<string>();
  const contextEdges: Record<string, string>[] = [];
  for (const relationship of snapshot.relationships) {
    const collapse = (endpoint: string): string =>
      endpoint === 'system' || internalKinds.has(kindById.get(endpoint) as ArchitectureElementKind)
        ? '__system__'
        : endpoint;
    const from = collapse(relationship.from);
    const to = collapse(relationship.to);
    if (from === to) continue;
    const key = `${from}\u0000${to}\u0000${relationship.description}\u0000${relationship.category ?? ''}`;
    if (contextEdgeKeys.has(key)) continue;
    contextEdgeKeys.add(key);
    contextEdges.push({
      from,
      to,
      label: relationship.description,
      category: relationship.category ?? 'interaction',
    });
  }
  const context = Diagram.parse({
    title: `${snapshot.system.name} · System context`,
    type: 'c4-context',
    description: 'People and external systems interacting with the system boundary.',
    nodes: contextElements.map(typedNode),
    edges: contextEdges,
  });
  const container = Diagram.parse({
    title: `${snapshot.system.name} · Containers`,
    type: 'c4-container',
    description: 'The deployable services, data stores, queues, actors, and external dependencies.',
    nodes: snapshot.elements.map(typedNode),
    edges: snapshot.relationships
      .filter((relationship) => relationship.from !== 'system' && relationship.to !== 'system')
      .map((relationship) => ({
        from: relationship.from,
        to: relationship.to,
        label: relationship.description,
        category: relationship.category ?? 'interaction',
        lens: 'both' as const,
      })),
  });
  files['.workspec/diagrams/system-context.yaml'] = yaml(
    context,
    'https://schema.workspec.io/v1alpha1/c4/diagram.schema.json',
  );
  files['.workspec/diagrams/container.yaml'] = yaml(
    container,
    'https://schema.workspec.io/v1alpha1/c4/diagram.schema.json',
  );
  return files;
}

export async function buildArchitectureWorkspace(
  input: unknown,
  key: number,
  imported = true,
): Promise<ArchitectureWorkspace> {
  const snapshot = parseArchitectureSnapshot(input);
  const files = buildFiles(snapshot);
  const model = await loadC4Model(createMemorySource(files));
  const errors = model.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    throw new ArchitectureSnapshotError(
      'invalid_model',
      `The generated model has ${errors.length} error${errors.length === 1 ? '' : 's'}: ${errors[0]?.message ?? 'unknown error'}`,
    );
  }
  return { key, snapshot, files, model, imported };
}

export function buildArchitectureBundle(workspace: ArchitectureWorkspace): {
  filename: string;
  bytes: Uint8Array;
  files: string[];
} {
  const files = Object.keys(workspace.files).sort();
  return {
    filename: `${slugifyName(workspace.snapshot.system.name)}-workspec.zip`,
    bytes: zipSync(
      Object.fromEntries(files.map((path) => [path, strToU8(workspace.files[path] ?? '')])),
    ),
    files,
  };
}

export async function buildArchitectureSvgBundle(
  workspace: ArchitectureWorkspace,
  theme: ThemeName,
): Promise<{ filename: string; bytes: Uint8Array; files: string[] }> {
  const laidOut = await layoutModel(workspace.model);
  const svgs: Record<string, Uint8Array> = {};
  for (const diagram of laidOut) {
    if (diagram.view !== null) {
      svgs[`${diagram.slug}.svg`] = strToU8(
        renderSvg(diagram.view, { spec: workspace.model.spec.data, theme, title: diagram.title }),
      );
    }
    if (diagram.lensViews !== null) {
      for (const lens of ['logical', 'deployment'] as const) {
        svgs[`${diagram.slug}-${lens}.svg`] = strToU8(
          renderSvg(diagram.lensViews[lens], {
            spec: workspace.model.spec.data,
            theme,
            title: `${diagram.title} · ${lens}`,
          }),
        );
      }
    }
  }
  const files = Object.keys(svgs).sort();
  return {
    filename: `${slugifyName(workspace.snapshot.system.name)}-diagrams.zip`,
    bytes: zipSync(svgs),
    files,
  };
}

function slugifyName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'architecture'
  );
}

export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface RelationshipProposal {
  id: string;
  fingerprint: string;
  relationship: ArchitectureRelationshipInput;
}

export interface ArchitectureWebMcpServiceOptions {
  getWorkspace: () => ArchitectureWorkspace;
  onWorkspace: (workspace: ArchitectureWorkspace) => void;
  onActivity?: (activity: ArchitectureActivity) => void;
  proposalIdFactory?: () => string;
}

let proposalSequence = 0;

export class ArchitectureWebMcpService {
  private readonly proposals = new Map<string, RelationshipProposal>();

  constructor(private readonly options: ArchitectureWebMcpServiceOptions) {}

  private activity(activity: ArchitectureActivity): void {
    this.options.onActivity?.(activity);
  }

  private fingerprint(): string {
    return JSON.stringify(this.options.getWorkspace().snapshot);
  }

  private proposalId(): string {
    if (this.options.proposalIdFactory !== undefined) return this.options.proposalIdFactory();
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    proposalSequence += 1;
    return `architecture-proposal-${proposalSequence}`;
  }

  async load(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = this.options.getWorkspace();
    const next = await buildArchitectureWorkspace(input, current.key + 1, true);
    this.proposals.clear();
    this.options.onWorkspace(next);
    this.activity({
      kind: 'applied',
      title: 'Architecture stocktake loaded',
      detail: `${next.snapshot.elements.length} elements and ${next.snapshot.relationships.length} relationships now drive the visible diagrams.`,
    });
    return { persisted: true, ...overview(next) };
  }

  getOverview(): Record<string, unknown> {
    const workspace = this.options.getWorkspace();
    const result = overview(workspace);
    this.activity({
      kind: 'inspected',
      title: 'Agent inspected the architecture',
      detail: `${workspace.snapshot.elements.length} elements · ${workspace.snapshot.relationships.length} relationships · ${workspace.model.diagrams.length} diagrams.`,
    });
    return result;
  }

  inspect(input: Record<string, unknown>): Record<string, unknown> {
    const id = requireString(input.elementId, 'elementId', 80);
    const workspace = this.options.getWorkspace();
    const element = workspace.snapshot.elements.find((candidate) => candidate.id === id);
    if (element === undefined)
      throw new ArchitectureSnapshotError(
        'element_not_found',
        `${id} is not in the current architecture.`,
      );
    const inbound = workspace.snapshot.relationships.filter(
      (relationship) => relationship.to === id,
    );
    const outbound = workspace.snapshot.relationships.filter(
      (relationship) => relationship.from === id,
    );
    this.activity({
      kind: 'inspected',
      title: `Agent inspected ${element.name}`,
      detail: `${element.kind} · ${inbound.length} inbound · ${outbound.length} outbound relationships.`,
    });
    return { element, inbound, outbound };
  }

  previewRelationship(input: Record<string, unknown>): Record<string, unknown> {
    const workspace = this.options.getWorkspace();
    const candidate = parseArchitectureSnapshot({
      ...workspace.snapshot,
      relationships: [...workspace.snapshot.relationships, input],
    });
    const relationship = candidate.relationships.at(-1);
    if (relationship === undefined)
      throw new ArchitectureSnapshotError('invalid_relationship', 'No relationship was supplied.');
    const duplicate = workspace.snapshot.relationships.some(
      (current) =>
        current.from === relationship.from &&
        current.to === relationship.to &&
        current.description === relationship.description,
    );
    if (duplicate)
      throw new ArchitectureSnapshotError(
        'duplicate_relationship',
        'That relationship already exists.',
      );
    const proposalId = this.proposalId();
    this.proposals.set(proposalId, {
      id: proposalId,
      fingerprint: this.fingerprint(),
      relationship,
    });
    this.activity({
      kind: 'previewed',
      title: 'Agent previewed a relationship',
      detail: `${relationship.from} → ${relationship.to} · no changes yet.`,
    });
    return {
      proposalId,
      persisted: false,
      relationship,
      projectedRelationshipCount: candidate.relationships.length,
    };
  }

  async applyRelationship(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const proposalId = requireString(input.proposalId, 'proposalId', 256);
    const proposal = this.proposals.get(proposalId);
    if (proposal === undefined) {
      throw new ArchitectureSnapshotError(
        'proposal_not_found',
        'That proposal is unknown or already used. Preview the relationship again.',
      );
    }
    const current = this.options.getWorkspace();
    if (proposal.fingerprint !== this.fingerprint()) {
      this.proposals.delete(proposalId);
      throw new ArchitectureSnapshotError(
        'stale_proposal',
        'The architecture changed after this preview. Preview the relationship again.',
      );
    }
    const next = await buildArchitectureWorkspace(
      {
        ...current.snapshot,
        relationships: [...current.snapshot.relationships, proposal.relationship],
      },
      current.key + 1,
      current.imported,
    );
    this.proposals.clear();
    this.options.onWorkspace(next);
    this.activity({
      kind: 'applied',
      title: 'Agent applied the relationship',
      detail: `${proposal.relationship.from} → ${proposal.relationship.to} now appears in the visible model.`,
    });
    return {
      proposalId,
      persisted: true,
      relationship: proposal.relationship,
      relationshipCount: next.snapshot.relationships.length,
    };
  }

  reportError(message: string): void {
    this.activity({
      kind: 'error',
      title: 'Architecture tool could not complete',
      detail: message,
    });
  }
}

function overview(workspace: ArchitectureWorkspace): Record<string, unknown> {
  const counts = Object.fromEntries(
    ARCHITECTURE_ELEMENT_KINDS.map((kind) => [
      kind,
      workspace.snapshot.elements.filter((element) => element.kind === kind).length,
    ]),
  );
  return {
    system: workspace.snapshot.system,
    elementCount: workspace.snapshot.elements.length,
    elementCountsByKind: counts,
    relationshipCount: workspace.snapshot.relationships.length,
    diagrams: workspace.model.diagrams.map((diagram) => ({
      slug: diagram.slug,
      title: diagram.title,
      type: diagram.type,
    })),
    diagnostics: workspace.model.diagnostics,
  };
}

function closedObjectSchema(
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

function relationshipSchema(): Record<string, unknown> {
  return closedObjectSchema(
    {
      from: {
        type: 'string',
        minLength: 1,
        maxLength: 80,
        description: 'Source element id, or "system".',
      },
      to: {
        type: 'string',
        minLength: 1,
        maxLength: 80,
        description: 'Target element id, or "system".',
      },
      description: { type: 'string', minLength: 1, maxLength: 240 },
      category: { type: 'string', enum: ['interaction', 'data', 'dependency'] },
    },
    ['from', 'to', 'description'],
  );
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof ArchitectureSnapshotError)
    return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'tool_failed', message: error.message };
  return { code: 'tool_failed', message: 'The architecture tool could not complete the request.' };
}

async function executeTool(
  service: ArchitectureWebMcpService,
  operation: () => Promise<Record<string, unknown>> | Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  try {
    if (signal?.aborted === true)
      throw new ArchitectureSnapshotError('cancelled', 'The tool call was cancelled.');
    return { ok: true, ...(await operation()) };
  } catch (error) {
    const details = errorDetails(error);
    service.reportError(details.message);
    return { ok: false, error: details };
  }
}

export function createArchitectureWebMcpTools(
  service: ArchitectureWebMcpService,
): WebMcpToolDefinition[] {
  const readAnnotations = { readOnlyHint: true, untrustedContentHint: false };
  const elementSchema = closedObjectSchema(
    {
      id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 },
      kind: { type: 'string', enum: ARCHITECTURE_ELEMENT_KINDS },
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: 'string', minLength: 1, maxLength: 1000 },
      technology: { type: 'string', minLength: 1, maxLength: 160 },
      tags: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 64 } },
    },
    ['id', 'kind', 'name', 'description'],
  );
  return [
    {
      name: 'load_architecture_snapshot',
      title: 'Load architecture snapshot',
      description:
        'WRITE ACTION: atomically replace the in-browser architecture with a validated system, element, and relationship stocktake. The data stays in this browser and immediately updates the visible diagrams.',
      inputSchema: closedObjectSchema(
        {
          system: closedObjectSchema(
            {
              name: { type: 'string', minLength: 1, maxLength: 120 },
              description: { type: 'string', minLength: 1, maxLength: 1000 },
              summary: { type: 'string', minLength: 1, maxLength: 240 },
            },
            ['name', 'description'],
          ),
          elements: { type: 'array', minItems: 1, maxItems: MAX_ELEMENTS, items: elementSchema },
          relationships: {
            type: 'array',
            maxItems: MAX_RELATIONSHIPS,
            items: relationshipSchema(),
          },
        },
        ['system', 'elements', 'relationships'],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input, options) => executeTool(service, () => service.load(input), options?.signal),
    },
    {
      name: 'get_architecture_overview',
      title: 'Get architecture overview',
      description:
        'Read the current system summary, counts by element kind, diagrams, relationships, and model diagnostics. Does not change the page.',
      inputSchema: closedObjectSchema(),
      annotations: readAnnotations,
      execute: (_input, options) =>
        executeTool(service, () => service.getOverview(), options?.signal),
    },
    {
      name: 'inspect_architecture_element',
      title: 'Inspect architecture element',
      description:
        'Read one current element and all of its inbound and outbound relationships. Does not change the page.',
      inputSchema: closedObjectSchema(
        { elementId: { type: 'string', minLength: 1, maxLength: 80 } },
        ['elementId'],
      ),
      annotations: readAnnotations,
      execute: (input, options) =>
        executeTool(service, () => service.inspect(input), options?.signal),
    },
    {
      name: 'preview_architecture_relationship',
      title: 'Preview architecture relationship',
      description:
        'Validate a proposed relationship and return an opaque proposalId and projected count without changing the page. Preview before applying.',
      inputSchema: relationshipSchema(),
      annotations: readAnnotations,
      execute: (input, options) =>
        executeTool(service, () => service.previewRelationship(input), options?.signal),
    },
    {
      name: 'apply_architecture_relationship',
      title: 'Apply previewed architecture relationship',
      description:
        'WRITE ACTION: apply exactly one previously previewed relationship. Rejects stale state, rebuilds the WorkSpec model, and immediately updates the visible diagrams.',
      inputSchema: closedObjectSchema(
        { proposalId: { type: 'string', minLength: 1, maxLength: 256 } },
        ['proposalId'],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input, options) =>
        executeTool(service, () => service.applyRelationship(input), options?.signal),
    },
  ];
}
