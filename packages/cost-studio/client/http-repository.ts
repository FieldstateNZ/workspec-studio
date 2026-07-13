// The browser-side repository: the same twelve-method CostRepositoryPort, but
// backed by the Express API instead of the filesystem. The UI depends only on
// the port, so swapping FsRepository (server) for HttpRepository (browser)
// needs no change to any view. Client → HTTP → Express → FsRepository →
// working tree. Mirrors `@workspec/decision-studio`'s `http-repository.ts`.

import type {
  Attribution,
  AttributionRef,
  CostRepositoryPort,
  Inventory,
  InventoryRef,
  Ref,
  Spend,
  SpendRef,
  TagPlan,
  TagPlanRef,
} from '@workspec/cost-schema';

async function fail(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error !== undefined) detail = body.error;
  } catch {
    /* non-JSON body */
  }
  throw new Error(`${response.status} ${detail}`);
}

/** A CostRepositoryPort implemented over the studio host's JSON API. */
export class HttpRepository implements CostRepositoryPort {
  constructor(private readonly base = '') {}

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`);
    if (!response.ok) await fail(response);
    return (await response.json()) as T;
  }

  private async put(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.base}${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) await fail(response);
  }

  listInventories(): Promise<InventoryRef[]> {
    return this.getJson('/api/inventories');
  }

  readInventory(ref: Ref): Promise<Inventory> {
    return this.getJson(`/api/inventory?ref=${encodeURIComponent(ref)}`);
  }

  writeInventory(ref: Ref, inventory: Inventory): Promise<void> {
    return this.put(`/api/inventory?ref=${encodeURIComponent(ref)}`, inventory);
  }

  listSpends(): Promise<SpendRef[]> {
    return this.getJson('/api/spends');
  }

  readSpend(ref: Ref): Promise<Spend> {
    return this.getJson(`/api/spend?ref=${encodeURIComponent(ref)}`);
  }

  writeSpend(ref: Ref, spend: Spend): Promise<void> {
    return this.put(`/api/spend?ref=${encodeURIComponent(ref)}`, spend);
  }

  listAttributions(): Promise<AttributionRef[]> {
    return this.getJson('/api/attributions');
  }

  readAttribution(ref: Ref): Promise<Attribution> {
    return this.getJson(`/api/attribution?ref=${encodeURIComponent(ref)}`);
  }

  writeAttribution(ref: Ref, attribution: Attribution): Promise<void> {
    return this.put(`/api/attribution?ref=${encodeURIComponent(ref)}`, attribution);
  }

  listTagPlans(): Promise<TagPlanRef[]> {
    return this.getJson('/api/tagplans');
  }

  readTagPlan(ref: Ref): Promise<TagPlan> {
    return this.getJson(`/api/tagplan?ref=${encodeURIComponent(ref)}`);
  }

  writeTagPlan(ref: Ref, tagPlan: TagPlan): Promise<void> {
    return this.put(`/api/tagplan?ref=${encodeURIComponent(ref)}`, tagPlan);
  }
}
