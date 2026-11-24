export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) { super(message); }
}

/** Talks to /api/admin/*. Mutating calls carry the header the server requires, and errors keep the server's message. */
export async function api<T = Record<string, unknown>>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { 'X-Requested-With': 'gwbr', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(String(data.error ?? `Request failed (${r.status})`), r.status, data);
  return data as T;
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Re-run the server so every tab picks up a change (mapping, locations, colour rules, new data). */
export const reloadDashboard = (week?: string) => window.location.assign(week ? `/?week=${week}` : window.location.pathname + window.location.search);
