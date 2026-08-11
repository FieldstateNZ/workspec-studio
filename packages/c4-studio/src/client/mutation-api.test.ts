import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMutationApi } from './mutation-api.js';

/** Records every call and answers with a canned response. */
function stubFetch(status = 200, body: unknown = { ok: true }): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createMutationApi — routes and payloads', () => {
  it('maps each method to its route with a JSON body', async () => {
    const fetchSpy = stubFetch();
    const api = createMutationApi();

    await api.createElement({ kind: 'container', name: 'X' });
    await api.updateElement({ slug: 'x', name: 'Y' });
    await api.deleteElement({ slug: 'x' });
    await api.createRelation({ diagram: 'd', from: 'a', to: 'b' });
    await api.renameRelation({ diagram: 'd', from: 'a', to: 'b', label: 'l' });
    await api.deleteRelation({ diagram: 'd', from: 'a', to: 'b' });

    const calls = fetchSpy.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).method,
      JSON.parse((init as RequestInit).body as string) as unknown,
    ]);
    expect(calls).toEqual([
      ['/api/elements', 'POST', { kind: 'container', name: 'X' }],
      ['/api/elements', 'PATCH', { slug: 'x', name: 'Y' }],
      ['/api/elements', 'DELETE', { slug: 'x' }],
      ['/api/relations', 'POST', { diagram: 'd', from: 'a', to: 'b' }],
      ['/api/relations', 'PATCH', { diagram: 'd', from: 'a', to: 'b', label: 'l' }],
      ['/api/relations', 'DELETE', { diagram: 'd', from: 'a', to: 'b' }],
    ]);
  });

  it('prefixes a base URL and resolves the parsed success body', async () => {
    stubFetch(201, { kind: 'actor', slug: 'ops', path: '.workspec/actors/ops.yaml' });
    const api = createMutationApi('http://127.0.0.1:4174');
    const created = await api.createElement({ kind: 'actor', name: 'Ops' });
    expect(created).toMatchObject({ slug: 'ops' });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://127.0.0.1:4174/api/elements');
  });

  it("rejects with the server's diagnostic message on a failed response", async () => {
    stubFetch(409, { error: 'a container element with slug "x" already exists' });
    const api = createMutationApi();
    await expect(api.createElement({ kind: 'container', name: 'X' })).rejects.toThrow(
      '409 a container element with slug "x" already exists',
    );
  });

  it('clearLayout PUTs an empty pin set to the diagram layout file', async () => {
    // (The real route answers 204; Response's constructor refuses a body
    // with 204, and clearLayout only checks `ok`, so 200 stands in.)
    const fetchSpy = stubFetch(200, {});
    await createMutationApi().clearLayout('system-context');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/file?path=${encodeURIComponent('.workspec/diagrams/.layout/system-context.yaml')}`,
    );
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string) as { content: string };
    expect(body.content).toContain('version: 1');
    expect(body.content).toContain('nodes: {}');
  });
});
