// The browser-side repository: the same six-method DecisionRepositoryPort, but
// backed by the Express API instead of the filesystem. The UI depends only on the
// port, so swapping FsRepository (server) for HttpRepository (browser) needs no
// change to any view. Client → HTTP → Express → FsRepository → working tree.

import type {
  Catalog,
  CatalogRef,
  Decision,
  DecisionRef,
  DecisionRepositoryPort,
  Ref,
} from '@workspec/decision-schema';

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

/** A DecisionRepositoryPort implemented over the studio host's JSON API. */
export class HttpRepository implements DecisionRepositoryPort {
  constructor(private readonly base: string = '') {}

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

  listDecisions(): Promise<DecisionRef[]> {
    return this.getJson('/api/decisions');
  }

  readDecision(ref: Ref): Promise<Decision> {
    return this.getJson(`/api/decision?ref=${encodeURIComponent(ref)}`);
  }

  writeDecision(ref: Ref, decision: Decision): Promise<void> {
    return this.put(`/api/decision?ref=${encodeURIComponent(ref)}`, decision);
  }

  listCatalogs(): Promise<CatalogRef[]> {
    return this.getJson('/api/catalogs');
  }

  readCatalog(ref: Ref): Promise<Catalog> {
    return this.getJson(`/api/catalog?ref=${encodeURIComponent(ref)}`);
  }

  writeCatalog(ref: Ref, catalog: Catalog): Promise<void> {
    return this.put(`/api/catalog?ref=${encodeURIComponent(ref)}`, catalog);
  }
}
