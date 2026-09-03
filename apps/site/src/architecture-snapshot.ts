import { strToU8, zipSync } from 'fflate';
import { stringify } from 'yaml';
import { layoutModel } from '@workspec/c4-layout';
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import type { C4Model } from '@workspec/c4-model';
import {
  ActorElement,
  C4Element,
  Diagram,
  DomainElement,
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
  'domain',
  'container',
  'component',
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
  /** Functional owner shown by the logical lens. Components only. */
  logicalParentId?: string;
  /** Runtime host shown by the deployment lens. Components only. */
  deploymentParentId?: string;
}

export interface ArchitectureRelationshipInput {
  from: string;
  to: string;
  description: string;
  category?: ArchitectureRelationshipCategory;
  lens?: 'logical' | 'deployment' | 'both';
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
    component: { accent: '#6366f1', icon: 'component', shape: 'box' },
    database: { accent: '#10b981', icon: 'database', shape: 'cylinder' },
    queue: { accent: '#f59e0b', icon: 'queue', shape: 'box' },
    domain: { accent: '#8b5cf6', icon: 'layers', shape: 'box' },
  },
  connections: {
    interaction: { accent: '#64748b', style: 'solid' },
    data: { accent: '#10b981', style: 'solid' },
    dependency: { accent: '#8b5cf6', style: 'dashed' },
  },
});

export const DEFAULT_ARCHITECTURE_SNAPSHOT: ArchitectureSnapshot = {
  system: {
    name: 'Stormglass',
    summary: 'A coordinated outage response and customer communications platform.',
    description:
      'Stormglass ingests outage reports and infrastructure telemetry, helps operations teams prioritise incidents, dispatches field crews, and keeps customers updated.',
  },
  elements: [
    {
      id: 'operations-coordinator',
      kind: 'actor',
      name: 'Operations Coordinator',
      description: 'Monitors active incidents, sets priorities, and dispatches field crews.',
    },
    {
      id: 'field-technician',
      kind: 'actor',
      name: 'Field Technician',
      description: 'Receives assignments and reports investigation and repair progress from the field.',
    },
    {
      id: 'customer',
      kind: 'actor',
      name: 'Customer',
      description: 'Reports outages and follows restoration progress.',
    },
    {
      id: 'utility-telemetry',
      kind: 'external-system',
      name: 'Utility Telemetry Platform',
      description: 'Streams equipment alarms and infrastructure telemetry.',
    },
    {
      id: 'weather-data',
      kind: 'external-system',
      name: 'Weather Data Service',
      description: 'Provides forecasts and severe-weather alerts for affected areas.',
    },
    {
      id: 'customer-messaging',
      kind: 'external-system',
      name: 'Customer Messaging Provider',
      description: 'Delivers outage and restoration notifications over SMS, email, and push.',
    },
    {
      id: 'incident-management',
      kind: 'domain',
      name: 'Incident Management',
      description: 'Owns the outage lifecycle, impact assessment, prioritisation, and restoration state.',
    },
    {
      id: 'field-operations',
      kind: 'domain',
      name: 'Field Operations',
      description: 'Coordinates dispatch, assignments, and progress reported by field crews.',
    },
    {
      id: 'customer-communications',
      kind: 'domain',
      name: 'Customer Communications',
      description: 'Owns outage reporting and proactive customer status updates.',
    },
    {
      id: 'situational-intelligence',
      kind: 'domain',
      name: 'Situational Intelligence',
      description: 'Combines telemetry and weather signals to detect and enrich incidents.',
    },
    {
      id: 'operations-web',
      kind: 'container',
      name: 'Operations Web',
      description: 'Hosts the browser experience used by operations teams.',
      technology: 'React',
    },
    {
      id: 'field-mobile',
      kind: 'container',
      name: 'Field Mobile App',
      description: 'Hosts the offline-capable experience used by field technicians.',
      technology: 'React Native',
    },
    {
      id: 'platform-api',
      kind: 'container',
      name: 'Platform API',
      description: 'Exposes incident, dispatch, and customer-reporting capabilities.',
      technology: '.NET',
    },
    {
      id: 'background-workers',
      kind: 'container',
      name: 'Background Workers',
      description: 'Runs telemetry ingestion, risk analysis, and notification workflows.',
      technology: '.NET',
    },
    {
      id: 'incident-store',
      kind: 'database',
      name: 'Incident Store',
      description: 'Stores incidents, assignments, observations, and customer notification state.',
      technology: 'PostgreSQL',
    },
    {
      id: 'event-bus',
      kind: 'queue',
      name: 'Event Bus',
      description: 'Distributes durable incident, dispatch, telemetry, and notification events.',
      technology: 'Cloud-neutral messaging',
    },
    {
      id: 'incident-command-ui', kind: 'component', name: 'Incident Command UI',
      description: 'Presents the live incident board and restoration workflow.', logicalParentId: 'incident-management', deploymentParentId: 'operations-web',
    },
    {
      id: 'incident-api', kind: 'component', name: 'Incident API',
      description: 'Owns incident commands, queries, prioritisation, and restoration state.', logicalParentId: 'incident-management', deploymentParentId: 'platform-api',
    },
    {
      id: 'dispatch-board-ui', kind: 'component', name: 'Dispatch Board UI',
      description: 'Lets coordinators assign crews and track field progress.', logicalParentId: 'field-operations', deploymentParentId: 'operations-web',
    },
    {
      id: 'technician-workflow', kind: 'component', name: 'Technician Workflow',
      description: 'Supports assignments, observations, and repair updates in the field.', logicalParentId: 'field-operations', deploymentParentId: 'field-mobile',
    },
    {
      id: 'dispatch-api', kind: 'component', name: 'Dispatch API',
      description: 'Coordinates assignments and technician progress.', logicalParentId: 'field-operations', deploymentParentId: 'platform-api',
    },
    {
      id: 'outage-reporting', kind: 'component', name: 'Outage Reporting',
      description: 'Accepts customer outage reports and returns current status.', logicalParentId: 'customer-communications', deploymentParentId: 'platform-api',
    },
    {
      id: 'notification-orchestrator', kind: 'component', name: 'Notification Orchestrator',
      description: 'Selects affected customers and schedules lifecycle notifications.', logicalParentId: 'customer-communications', deploymentParentId: 'background-workers',
    },
    {
      id: 'telemetry-ingestion', kind: 'component', name: 'Telemetry Ingestion',
      description: 'Normalises equipment alarms and converts signals into incident candidates.', logicalParentId: 'situational-intelligence', deploymentParentId: 'background-workers',
    },
    {
      id: 'weather-risk-analysis', kind: 'component', name: 'Weather Risk Analysis',
      description: 'Enriches incidents with forecasts and severe-weather risk.', logicalParentId: 'situational-intelligence', deploymentParentId: 'background-workers',
    },
  ],
  relationships: [
    { from: 'operations-coordinator', to: 'incident-command-ui', description: 'Prioritises incidents and coordinates restoration', category: 'interaction' },
    { from: 'operations-coordinator', to: 'dispatch-board-ui', description: 'Dispatches crews and tracks field progress', category: 'interaction' },
    { from: 'field-technician', to: 'technician-workflow', description: 'Receives work and reports repair progress', category: 'interaction' },
    { from: 'customer', to: 'outage-reporting', description: 'Reports outages and tracks restoration', category: 'interaction' },
    { from: 'utility-telemetry', to: 'telemetry-ingestion', description: 'Streams equipment alarms and telemetry', category: 'data' },
    { from: 'weather-data', to: 'weather-risk-analysis', description: 'Provides forecasts and severe-weather alerts', category: 'data' },
    { from: 'notification-orchestrator', to: 'customer-messaging', description: 'Sends outage and restoration notifications', category: 'interaction' },
    { from: 'incident-command-ui', to: 'incident-api', description: 'Submits incident commands and queries', category: 'interaction' },
    { from: 'dispatch-board-ui', to: 'dispatch-api', description: 'Submits assignments and reads crew status', category: 'interaction' },
    { from: 'technician-workflow', to: 'dispatch-api', description: 'Synchronises assignments and field updates', category: 'interaction' },
    { from: 'outage-reporting', to: 'incident-api', description: 'Creates reports and reads incident status', category: 'interaction' },
    { from: 'telemetry-ingestion', to: 'incident-api', description: 'Creates telemetry-derived incident candidates', category: 'dependency' },
    { from: 'weather-risk-analysis', to: 'incident-api', description: 'Enriches incidents with weather risk', category: 'dependency' },
    { from: 'incident-api', to: 'dispatch-api', description: 'Requests operational response', category: 'dependency' },
    { from: 'incident-api', to: 'notification-orchestrator', description: 'Publishes customer-impact changes', category: 'dependency' },
    { from: 'incident-api', to: 'incident-store', description: 'Reads and writes incident state', category: 'data' },
    { from: 'dispatch-api', to: 'incident-store', description: 'Reads and writes assignment state', category: 'data' },
    { from: 'incident-api', to: 'event-bus', description: 'Publishes incident lifecycle events', category: 'data' },
    { from: 'telemetry-ingestion', to: 'event-bus', description: 'Consumes telemetry and publishes candidates', category: 'data' },
    { from: 'notification-orchestrator', to: 'event-bus', description: 'Consumes customer-impact events', category: 'data' },
  ],
};

/** Minimal valid workspace used for a genuinely blank Studio session. */
export const EMPTY_ARCHITECTURE_SNAPSHOT: ArchitectureSnapshot = {
  system: {
    name: 'New WorkSpec project',
    description: 'A new system architecture.',
  },
  elements: [],
  relationships: [],
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
  if (!Array.isArray(root.elements)) {
    throw new ArchitectureSnapshotError(
      'invalid_input',
      'snapshot.elements must be an array.',
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
      ['id', 'kind', 'name', 'description', 'technology', 'tags', 'logicalParentId', 'deploymentParentId'],
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
    if ((kind === 'actor' || kind === 'external-system' || kind === 'domain') && technology !== undefined) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${kind} elements do not accept technology.`,
      );
    }
    const logicalParentId = optionalString(
      value.logicalParentId,
      `snapshot.elements[${index}].logicalParentId`,
      80,
    );
    const deploymentParentId = optionalString(
      value.deploymentParentId,
      `snapshot.elements[${index}].deploymentParentId`,
      80,
    );
    if (kind !== 'component' && (logicalParentId !== undefined || deploymentParentId !== undefined)) {
      throw new ArchitectureSnapshotError(
        'invalid_input',
        `${kind} elements do not accept logicalParentId or deploymentParentId.`,
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
      ...(logicalParentId !== undefined ? { logicalParentId } : {}),
      ...(deploymentParentId !== undefined ? { deploymentParentId } : {}),
    };
  });
  const kindById = new Map(elements.map((element) => [element.id, element.kind]));
  for (const element of elements) {
    if (element.kind !== 'component') continue;
    if (element.logicalParentId !== undefined && kindById.get(element.logicalParentId) !== 'domain') {
      throw new ArchitectureSnapshotError('invalid_parent', `${element.id}.logicalParentId must reference a domain.`);
    }
    if (element.deploymentParentId !== undefined && kindById.get(element.deploymentParentId) !== 'container') {
      throw new ArchitectureSnapshotError('invalid_parent', `${element.id}.deploymentParentId must reference a container.`);
    }
  }
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
      ['from', 'to', 'description', 'category', 'lens'],
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
    const lens = value.lens ?? 'both';
    if (!['logical', 'deployment', 'both'].includes(String(lens))) {
      throw new ArchitectureSnapshotError('invalid_input', `${String(lens)} is not a supported relationship lens.`);
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
      lens: lens as 'logical' | 'deployment' | 'both',
    };
  });
  return { system, elements, relationships };
}

const DIRECTORY_BY_KIND: Record<ArchitectureElementKind, string> = {
  actor: 'actors',
  'external-system': 'external-systems',
  domain: 'domains',
  container: 'containers',
  component: 'components',
  database: 'databases',
  queue: 'queues',
};

function yaml(value: unknown, schemaUrl: string): string {
  return `# yaml-language-server: $schema=${schemaUrl}\n${stringify(value, { lineWidth: 0 })}`;
}

function typedNode(element: ArchitectureElementInput): Record<string, string> {
  return { [element.kind]: element.id };
}

export function buildArchitectureFiles(snapshot: ArchitectureSnapshot): Record<string, string> {
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
      ...(element.kind === 'container' || element.kind === 'component' || element.kind === 'database' || element.kind === 'queue'
        ? { type: element.kind }
        : {}),
      title: element.name,
      description: element.description,
      ...(element.technology !== undefined ? { technology: element.technology } : {}),
      ...(element.tags !== undefined ? { tags: element.tags } : {}),
      ...(element.kind === 'component' ? {
        links: [
          ...(element.logicalParentId ? [{ 'feature-in-domain': `~/domains/${element.logicalParentId}.yaml` }] : []),
          ...(element.deploymentParentId ? [{ 'part-of': `~/containers/${element.deploymentParentId}.yaml` }] : []),
        ],
      } : {}),
    };
    const parsed =
      element.kind === 'actor'
        ? ActorElement.parse(data)
        : element.kind === 'external-system'
          ? ExternalSystemElement.parse(data)
          : element.kind === 'domain'
            ? DomainElement.parse(data)
          : C4Element.parse(data);
    files[`.workspec/${DIRECTORY_BY_KIND[element.kind]}/${element.id}.yaml`] = yaml(
      parsed,
      `https://schema.workspec.io/v1alpha1/c4/${element.kind}.schema.json`,
    );
  }

  const internalKinds = new Set<ArchitectureElementKind>(['domain', 'container', 'component', 'database', 'queue']);
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
  const containerElements = snapshot.elements.filter((element) => element.kind !== 'component');
  const projectEndpoint = (id: string, lens: 'logical' | 'deployment'): string | null => {
    if (id === 'system') return '__system__';
    const element = snapshot.elements.find((candidate) => candidate.id === id);
    if (!element) return null;
    if (element.kind === 'component') {
      return lens === 'logical'
        ? element.logicalParentId ?? null
        : element.deploymentParentId ?? null;
    }
    if (lens === 'logical' && ['container', 'database', 'queue'].includes(element.kind)) return null;
    if (lens === 'deployment' && element.kind === 'domain') return null;
    return element.id;
  };
  const containerEdges: Record<string, string>[] = [];
  const containerEdgeKeys = new Set<string>();
  for (const relationship of snapshot.relationships) {
    for (const lens of ['logical', 'deployment'] as const) {
      if (relationship.lens && relationship.lens !== 'both' && relationship.lens !== lens) continue;
      const from = projectEndpoint(relationship.from, lens);
      const to = projectEndpoint(relationship.to, lens);
      if (!from || !to || from === to) continue;
      const key = `${lens}\u0000${from}\u0000${to}\u0000${relationship.description}`;
      if (containerEdgeKeys.has(key)) continue;
      containerEdgeKeys.add(key);
      containerEdges.push({ from, to, label: relationship.description, category: relationship.category ?? 'interaction', lens });
    }
  }
  const container = Diagram.parse({
    title: `${snapshot.system.name} · Containers`,
    type: 'c4-container',
    description: 'The deployable services, data stores, queues, actors, and external dependencies.',
    nodes: containerElements.map(typedNode),
    edges: containerEdges,
  });
  files['.workspec/diagrams/system-context.yaml'] = yaml(
    context,
    'https://schema.workspec.io/v1alpha1/c4/diagram.schema.json',
  );
  files['.workspec/diagrams/container.yaml'] = yaml(
    container,
    'https://schema.workspec.io/v1alpha1/c4/diagram.schema.json',
  );
  const drillParents = snapshot.elements.filter((element) => element.kind === 'domain' || element.kind === 'container');
  for (const parent of drillParents) {
    const parentField = parent.kind === 'domain' ? 'logicalParentId' : 'deploymentParentId';
    const components = snapshot.elements.filter((element) => element.kind === 'component' && element[parentField] === parent.id);
    const componentIds = new Set(components.map((element) => element.id));
    const componentDiagram = Diagram.parse({
      title: `${parent.name} · Components`,
      type: 'c4-component',
      description: parent.kind === 'domain'
        ? `Functional components owned by ${parent.name}.`
        : `Components deployed in ${parent.name}.`,
      nodes: components.map(typedNode),
      edges: snapshot.relationships
        .filter((relationship) => componentIds.has(relationship.from) && componentIds.has(relationship.to))
        .map((relationship) => ({ from: relationship.from, to: relationship.to, label: relationship.description, category: relationship.category ?? 'interaction' })),
    });
    files[`.workspec/diagrams/${parent.id}.yaml`] = yaml(componentDiagram, 'https://schema.workspec.io/v1alpha1/c4/diagram.schema.json');
  }
  return files;
}

export async function buildArchitectureWorkspace(
  input: unknown,
  key: number,
  imported = true,
): Promise<ArchitectureWorkspace> {
  const snapshot = parseArchitectureSnapshot(input);
  const files = buildArchitectureFiles(snapshot);
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

export async function loadArchitectureWorkspace(
  files: Record<string, string>,
  key: number,
): Promise<ArchitectureWorkspace> {
  const model = await loadC4Model(createMemorySource(files));
  const errors = model.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    throw new ArchitectureSnapshotError(
      'invalid_model',
      `The imported C4 model has ${errors.length} error${errors.length === 1 ? '' : 's'}: ${errors[0]?.message ?? 'unknown error'}`,
    );
  }
  const systemEntry = [...model.elements.system.values()][0];
  if (systemEntry === undefined) {
    throw new ArchitectureSnapshotError('invalid_model', 'The imported workspace has no C4 system.');
  }
  const systemData = systemEntry.element.data;
  const kinds: readonly ArchitectureElementKind[] = ['actor', 'external-system', 'domain', 'container', 'component', 'database', 'queue'];
  const elements = kinds.flatMap((kind) => [...model.elements[kind].values()].map((loaded): ArchitectureElementInput => {
    const data = loaded.element.data;
    const links = 'links' in data && Array.isArray(data.links) ? data.links : [];
    const linkedSlug = (linkType: string, directory: string): string | undefined => {
      for (const raw of links) {
        if (!isRecord(raw) || typeof raw[linkType] !== 'string') continue;
        const match = (raw[linkType] as string).match(new RegExp(`(?:^|/)${directory}/([^/]+)\\.ya?ml$`));
        if (match?.[1]) return match[1];
      }
      return undefined;
    };
    const logicalParentId = kind === 'component' ? linkedSlug('feature-in-domain', 'domains') : undefined;
    const deploymentParentId = kind === 'component' ? linkedSlug('part-of', 'containers') : undefined;
    return {
      id: loaded.slug,
      kind,
      name: data.title,
      description: data.description ?? data.title,
      ...('technology' in data && data.technology ? { technology: data.technology } : {}),
      ...('tags' in data && data.tags?.length ? { tags: [...data.tags] } : {}),
      ...(logicalParentId ? { logicalParentId } : {}),
      ...(deploymentParentId ? { deploymentParentId } : {}),
    };
  }));
  const diagram = model.diagrams.find((candidate) => candidate.type === 'c4-container');
  const relationshipKeys = new Set<string>();
  const relationships = (['logical', 'deployment'] as const).flatMap((lens): ArchitectureRelationshipInput[] => {
    const view = diagram?.lensViews?.[lens] ?? diagram?.view;
    return (view?.edges ?? []).flatMap((edge): ArchitectureRelationshipInput[] => {
      const from = edge.from === '__system__' ? 'system' : edge.from;
      const to = edge.to === '__system__' ? 'system' : edge.to;
      if (edge.dangling || from === to) return [];
      const description = edge.label ?? 'connects to';
      const key = `${from}\u0000${to}\u0000${description}`;
      if (relationshipKeys.has(key)) return [];
      relationshipKeys.add(key);
      const category = ['interaction', 'data', 'dependency'].includes(edge.category ?? '')
        ? edge.category as ArchitectureRelationshipCategory
        : 'interaction';
      return [{ from, to, description, category, lens: edge.lens === 'both' ? 'both' : lens }];
    });
  });
  const snapshot: ArchitectureSnapshot = {
    system: {
      name: systemData.title,
      description: systemData.description ?? systemData.title,
      ...('summary' in systemData && systemData.summary ? { summary: systemData.summary } : {}),
    },
    elements,
    relationships,
  };
  return { key, snapshot, files, model, imported: true };
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

export function bytesBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function bytesDataUrl(bytes: Uint8Array): string {
  return `data:application/zip;base64,${bytesBase64(bytes)}`;
}

export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const link = document.createElement('a');
  link.href = bytesDataUrl(bytes);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
      lens: { type: 'string', enum: ['logical', 'deployment', 'both'] },
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
      logicalParentId: { type: 'string', description: 'For a component, the domain that owns it in the logical lens.' },
      deploymentParentId: { type: 'string', description: 'For a component, the runtime container that hosts it in the deployment lens.' },
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
