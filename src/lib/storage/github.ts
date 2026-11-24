import { assertSafeKey, type Storage } from './types';

type FetchFn = typeof fetch;

export interface GithubOptions {
  token: string;
  /** "owner/name" of the private data repo. */
  repo: string;
  branch: string;
  fetchFn?: FetchFn;
}

/**
 * Keeps each JSON document as a file in a private GitHub repo (one commit per save).
 * Uses only the Contents API, so the token needs "Contents: read and write" on that one repo.
 */
export class GithubStorage implements Storage {
  private f: FetchFn;
  constructor(private o: GithubOptions) {
    this.f = o.fetchFn ?? fetch;
  }

  private url(key: string): string {
    assertSafeKey(key);
    return `https://api.github.com/repos/${this.o.repo}/contents/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.o.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wbr-data-store',
    };
  }

  private async read(key: string): Promise<{ sha: string; text: string } | null> {
    const q = `?ref=${encodeURIComponent(this.o.branch)}`;
    const r = await this.f(this.url(key) + q, { headers: this.headers(), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub read ${key}: ${r.status}`);
    const j = (await r.json()) as { sha: string; content?: string; encoding?: string };
    if (j.content && j.encoding === 'base64') return { sha: j.sha, text: Buffer.from(j.content, 'base64').toString('utf8') };
    // files over 1 MB come back without inline content: fetch the raw blob instead
    const raw = await this.f(this.url(key) + q, {
      headers: { ...this.headers(), Accept: 'application/vnd.github.raw+json' },
      cache: 'no-store',
    });
    if (!raw.ok) throw new Error(`GitHub raw read ${key}: ${raw.status}`);
    return { sha: j.sha, text: await raw.text() };
  }

  async get<T>(key: string): Promise<T | null> {
    const r = await this.read(key);
    return r ? (JSON.parse(r.text) as T) : null;
  }

  async put(key: string, value: unknown): Promise<void> {
    const body = JSON.stringify(value, null, 1);
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await this.read(key);
      const res = await this.f(this.url(key), {
        method: 'PUT',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Update ${key}`,
          content: Buffer.from(body, 'utf8').toString('base64'),
          branch: this.o.branch,
          ...(cur ? { sha: cur.sha } : {}),
        }),
      });
      if (res.ok) return;
      if (res.status !== 409 && res.status !== 422) throw new Error(`GitHub write ${key}: ${res.status}`);
    }
    throw new Error(`GitHub write ${key}: conflict after retries`);
  }

  async delete(key: string): Promise<void> {
    const cur = await this.read(key);
    if (!cur) return;
    const res = await this.f(this.url(key), {
      method: 'DELETE',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Delete ${key}`, sha: cur.sha, branch: this.o.branch }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub delete ${key}: ${res.status}`);
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
    const walk = async (d: string) => {
      const path = d.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      const u = `https://api.github.com/repos/${this.o.repo}/contents/${path}?ref=${encodeURIComponent(this.o.branch)}`;
      const r = await this.f(u, { headers: this.headers(), cache: 'no-store' });
      if (r.status === 404) return;
      if (!r.ok) throw new Error(`GitHub list ${d}: ${r.status}`);
      const items = (await r.json()) as { path: string; type: string }[];
      for (const it of Array.isArray(items) ? items : []) {
        if (it.type === 'dir') await walk(it.path);
        else if (it.path.startsWith(prefix)) out.push(it.path);
      }
    };
    await walk(dir);
    return out.sort();
  }
}
