// The repository port — the single storage abstraction the Cost Attribution
// CLI (`workspec-cost`, in `@workspec/cost-studio`) depends on. One
// implementation runs standalone over the filesystem (`FsRepository`, in the
// studio package) and, later, a graph-backed one may run inside WorkSpec
// Enterprise. Both satisfy this port.
//
// It is deliberately SMALL: exactly twelve methods (list/read/write for each
// of the four artifact kinds), no watch/subscribe, no history, no
// concurrency control — the same minimal-surface philosophy as
// `@workspec/decision-schema`'s six-method `DecisionRepositoryPort` (the
// working tree + git already provide versioning and review).
//
// `createMemoryRepository` is the in-memory test double: factory-built, never
// a shared mutable fixture.

import { InventoryArtifact } from './inventory.js';
import { SpendArtifact } from './spend.js';
import { AttributionArtifact } from './attribution.js';
import { TagPlanArtifact } from './tagplan.js';
import type { Inventory } from './inventory.js';
import type { Spend } from './spend.js';
import type { Attribution } from './attribution.js';
import type { TagPlan } from './tagplan.js';

/**
 * An opaque reference to a stored artifact — an id or path. Standalone
 * (`FsRepository`) uses repo-root-relative file paths; a graph-backed
 * implementation may use node ids. Callers treat it as an opaque string.
 */
export type Ref = string;

/** An inventory list entry: its ref plus enough identity to render a picker. */
export interface InventoryRef {
  /** The opaque ref to pass back to `readInventory`/`writeInventory`. */
  ref: Ref;
  /** The inventory's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The inventory's `spec.name`, when known. */
  name?: string;
}

/** A spend list entry: its ref plus enough identity to render a picker. */
export interface SpendRef {
  /** The opaque ref to pass back to `readSpend`/`writeSpend`. */
  ref: Ref;
  /** The spend's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The spend's `spec.name`, when known. */
  name?: string;
}

/** An attribution list entry: its ref plus enough identity to render a picker. */
export interface AttributionRef {
  /** The opaque ref to pass back to `readAttribution`/`writeAttribution`. */
  ref: Ref;
  /** The attribution's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The attribution's `spec.name`, when known. */
  name?: string;
}

/** A tag-plan list entry: its ref plus enough identity to render a picker. */
export interface TagPlanRef {
  /** The opaque ref to pass back to `readTagPlan`/`writeTagPlan`. */
  ref: Ref;
  /** The tag plan's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The tag plan's `spec.name`, when known. */
  name?: string;
}

/**
 * The storage port. **Exactly twelve methods** — three per artifact kind. Any
 * implementation (filesystem, in-memory, graph-backed) provides these and
 * only these; extending the port is a deliberate cross-cutting change, not a
 * local one.
 */
export interface CostRepositoryPort {
  /** List every inventory artifact the repository can see. */
  listInventories(): Promise<InventoryRef[]>;
  /** Read + validate an inventory by ref. Rejects if missing or invalid. */
  readInventory(ref: Ref): Promise<Inventory>;
  /** Validate + persist an inventory at ref. Rejects if invalid. */
  writeInventory(ref: Ref, inventory: Inventory): Promise<void>;
  /** List every spend artifact the repository can see. */
  listSpends(): Promise<SpendRef[]>;
  /** Read + validate a spend record by ref. Rejects if missing or invalid. */
  readSpend(ref: Ref): Promise<Spend>;
  /** Validate + persist a spend record at ref. Rejects if invalid. */
  writeSpend(ref: Ref, spend: Spend): Promise<void>;
  /** List every attribution artifact the repository can see. */
  listAttributions(): Promise<AttributionRef[]>;
  /** Read + validate an attribution by ref. Rejects if missing or invalid. */
  readAttribution(ref: Ref): Promise<Attribution>;
  /** Validate + persist an attribution at ref. Rejects if invalid. */
  writeAttribution(ref: Ref, attribution: Attribution): Promise<void>;
  /** List every tag-plan artifact the repository can see. */
  listTagPlans(): Promise<TagPlanRef[]>;
  /** Read + validate a tag plan by ref. Rejects if missing or invalid. */
  readTagPlan(ref: Ref): Promise<TagPlan>;
  /** Validate + persist a tag plan at ref. Rejects if invalid. */
  writeTagPlan(ref: Ref, tagPlan: TagPlan): Promise<void>;
}

/** The exact method names of the port, as a runtime-checkable tuple. */
export const COST_REPOSITORY_METHODS = [
  'listInventories',
  'readInventory',
  'writeInventory',
  'listSpends',
  'readSpend',
  'writeSpend',
  'listAttributions',
  'readAttribution',
  'writeAttribution',
  'listTagPlans',
  'readTagPlan',
  'writeTagPlan',
] as const;

/** Seed data for {@link createMemoryRepository}. Every map is keyed by ref. */
export interface MemoryRepositorySeed {
  /** Inventories to preload, keyed by the ref they are stored under. */
  inventories?: Record<Ref, Inventory>;
  /** Spend records to preload, keyed by the ref they are stored under. */
  spends?: Record<Ref, Spend>;
  /** Attributions to preload, keyed by the ref they are stored under. */
  attributions?: Record<Ref, Attribution>;
  /** Tag plans to preload, keyed by the ref they are stored under. */
  tagPlans?: Record<Ref, TagPlan>;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function validateInventory(ref: Ref, inventory: Inventory): Inventory {
  const result = InventoryArtifact.safeParse(inventory);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid inventory at "${ref}" (${where})`);
  }
  return result.data;
}

function validateSpend(ref: Ref, spend: Spend): Spend {
  const result = SpendArtifact.safeParse(spend);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid spend at "${ref}" (${where})`);
  }
  return result.data;
}

function validateAttribution(ref: Ref, attribution: Attribution): Attribution {
  const result = AttributionArtifact.safeParse(attribution);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid attribution at "${ref}" (${where})`);
  }
  return result.data;
}

function validateTagPlan(ref: Ref, tagPlan: TagPlan): TagPlan {
  const result = TagPlanArtifact.safeParse(tagPlan);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid tag plan at "${ref}" (${where})`);
  }
  return result.data;
}

/**
 * Build an in-memory {@link CostRepositoryPort} — the CLI/UI test double.
 *
 * Factory-built (never a shared mutable module singleton) so each test owns
 * an isolated instance. Writes validate through Zod; reads and the seed both
 * return deep clones, so a caller mutating a returned artifact cannot
 * corrupt the store. Insertion order is preserved for stable `list*` output.
 */
export function createMemoryRepository(seed: MemoryRepositorySeed = {}): CostRepositoryPort {
  const inventories = new Map<Ref, Inventory>();
  const spends = new Map<Ref, Spend>();
  const attributions = new Map<Ref, Attribution>();
  const tagPlans = new Map<Ref, TagPlan>();

  for (const [ref, inventory] of Object.entries(seed.inventories ?? {})) {
    inventories.set(ref, cloneJson(validateInventory(ref, inventory)));
  }
  for (const [ref, spend] of Object.entries(seed.spends ?? {})) {
    spends.set(ref, cloneJson(validateSpend(ref, spend)));
  }
  for (const [ref, attribution] of Object.entries(seed.attributions ?? {})) {
    attributions.set(ref, cloneJson(validateAttribution(ref, attribution)));
  }
  for (const [ref, tagPlan] of Object.entries(seed.tagPlans ?? {})) {
    tagPlans.set(ref, cloneJson(validateTagPlan(ref, tagPlan)));
  }

  return {
    listInventories(): Promise<InventoryRef[]> {
      return Promise.resolve(
        [...inventories.entries()].map(([ref, inventory]) => ({
          ref,
          ...(inventory.metadata.slug !== undefined ? { slug: inventory.metadata.slug } : {}),
          ...(inventory.spec.name !== undefined ? { name: inventory.spec.name } : {}),
        })),
      );
    },
    readInventory(ref: Ref): Promise<Inventory> {
      const inventory = inventories.get(ref);
      if (inventory === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no inventory at "${ref}"`));
      }
      return Promise.resolve(cloneJson(inventory));
    },
    writeInventory(ref: Ref, inventory: Inventory): Promise<void> {
      try {
        inventories.set(ref, cloneJson(validateInventory(ref, inventory)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    listSpends(): Promise<SpendRef[]> {
      return Promise.resolve(
        [...spends.entries()].map(([ref, spend]) => ({
          ref,
          ...(spend.metadata.slug !== undefined ? { slug: spend.metadata.slug } : {}),
          ...(spend.spec.name !== undefined ? { name: spend.spec.name } : {}),
        })),
      );
    },
    readSpend(ref: Ref): Promise<Spend> {
      const spend = spends.get(ref);
      if (spend === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no spend at "${ref}"`));
      }
      return Promise.resolve(cloneJson(spend));
    },
    writeSpend(ref: Ref, spend: Spend): Promise<void> {
      try {
        spends.set(ref, cloneJson(validateSpend(ref, spend)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    listAttributions(): Promise<AttributionRef[]> {
      return Promise.resolve(
        [...attributions.entries()].map(([ref, attribution]) => ({
          ref,
          ...(attribution.metadata.slug !== undefined ? { slug: attribution.metadata.slug } : {}),
          ...(attribution.spec.name !== undefined ? { name: attribution.spec.name } : {}),
        })),
      );
    },
    readAttribution(ref: Ref): Promise<Attribution> {
      const attribution = attributions.get(ref);
      if (attribution === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no attribution at "${ref}"`));
      }
      return Promise.resolve(cloneJson(attribution));
    },
    writeAttribution(ref: Ref, attribution: Attribution): Promise<void> {
      try {
        attributions.set(ref, cloneJson(validateAttribution(ref, attribution)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    listTagPlans(): Promise<TagPlanRef[]> {
      return Promise.resolve(
        [...tagPlans.entries()].map(([ref, tagPlan]) => ({
          ref,
          ...(tagPlan.metadata.slug !== undefined ? { slug: tagPlan.metadata.slug } : {}),
          ...(tagPlan.spec.name !== undefined ? { name: tagPlan.spec.name } : {}),
        })),
      );
    },
    readTagPlan(ref: Ref): Promise<TagPlan> {
      const tagPlan = tagPlans.get(ref);
      if (tagPlan === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no tag plan at "${ref}"`));
      }
      return Promise.resolve(cloneJson(tagPlan));
    },
    writeTagPlan(ref: Ref, tagPlan: TagPlan): Promise<void> {
      try {
        tagPlans.set(ref, cloneJson(validateTagPlan(ref, tagPlan)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
  };
}
