import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared test toolkit. Used by route + lib tests to fake Supabase, build
// Requests, and read Responses without any live services.
// ---------------------------------------------------------------------------

export interface QueryResult {
  data?: unknown;
  error?: unknown;
}

/**
 * A chainable, thenable Supabase query-builder mock. Every chainable method
 * returns the same object so `.from().select().eq().maybeSingle()` works, and
 * the object is awaitable (resolves to `result`) so `await sb.from().insert()`
 * works too. Terminal `single`/`maybeSingle` resolve to `result`.
 */
export function makeChain(result: QueryResult = { data: null, error: null }) {
  const chain: Record<string, unknown> = {};
  const chainable = [
    'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte',
    'lt', 'lte', 'in', 'is', 'match', 'order', 'limit', 'range', 'filter', 'not',
    'contains', 'returns', 'or', 'ilike', 'like',
  ];
  for (const m of chainable) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Thenable: awaiting the chain (e.g. a bare insert/update) resolves `result`.
  chain.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  chain.__result = result;
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: PromiseLike<QueryResult>['then'] };
}

export interface FakeSupabaseOptions {
  /** Per-table chain. Falls back to `defaultChain` for unlisted tables. */
  tables?: Record<string, ReturnType<typeof makeChain>>;
  defaultChain?: ReturnType<typeof makeChain>;
  /** Result returned by `.rpc()` (defaults to { data: 1, error: null }). */
  rpc?: QueryResult;
  /** User returned by `auth.getUser()`. */
  user?: unknown;
}

/** A fake Supabase client (admin or server) with from/rpc/auth/storage. */
export function makeSupabase(opts: FakeSupabaseOptions = {}) {
  const def = opts.defaultChain ?? makeChain();
  return {
    from: vi.fn((t: string) => opts.tables?.[t] ?? def),
    rpc: vi.fn(() => Promise.resolve(opts.rpc ?? { data: 1, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user ?? null }, error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'audio/x.ogg' }, error: null })),
        createSignedUrl: vi.fn(() =>
          Promise.resolve({ data: { signedUrl: 'https://signed/x' }, error: null }),
        ),
        download: vi.fn(() => Promise.resolve({ data: new Blob(['x']), error: null })),
      })),
    },
  };
}

/** A minimal authenticated user object. */
export function fakeUser(overrides: Partial<{ id: string; email: string }> = {}) {
  return { id: overrides.id ?? 'user-1', email: overrides.email ?? 'user@example.com', ...overrides };
}

/** Build a JSON Request (defaults to POST). */
export function jsonRequest(url: string, body?: unknown, init: RequestInit = {}) {
  return new Request(url, {
    method: (init.method as string) ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Build a raw-body Request with arbitrary headers (for signature tests). */
export function rawRequest(url: string, body: string, headers: Record<string, string> = {}, method = 'POST') {
  return new Request(url, { method, headers, body });
}

/** Read a handler Response into { status, body }. */
export async function readJson(res: Response): Promise<{ status: number; body: unknown }> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}
