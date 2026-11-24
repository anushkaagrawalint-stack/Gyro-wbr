import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorage } from '../src/lib/storage';
import { GithubStorage } from '../src/lib/storage/github';
import { LocalStorage } from '../src/lib/storage/local';
import type { Storage } from '../src/lib/storage/types';

const dir = mkdtempSync(path.join(tmpdir(), 'wbr-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function contract(s: Storage) {
  expect(await s.get('config/a.json')).toBeNull();
  await s.put('config/a.json', { x: 1 });
  await s.put('weeks/2026-10-12.json', { w: 1 });
  await s.put('weeks/2026-10-05.json', { w: 0 });
  expect(await s.get('config/a.json')).toEqual({ x: 1 });
  await s.put('config/a.json', { x: 2 });
  expect(await s.get('config/a.json')).toEqual({ x: 2 });
  expect(await s.list('weeks/')).toEqual(['weeks/2026-10-05.json', 'weeks/2026-10-12.json']);
  await s.delete('weeks/2026-10-05.json');
  await s.delete('weeks/never-existed.json'); // deleting nothing is fine
  expect(await s.list('weeks/')).toEqual(['weeks/2026-10-12.json']);
  await expect(s.put('../escape.json', {})).rejects.toThrow(/Unsafe/);
  await expect(s.get('config/../../x.json')).rejects.toThrow(/Unsafe/);
}

describe('LocalStorage', () => {
  it('satisfies the storage contract', async () => contract(new LocalStorage(path.join(dir, 'local'))));
});

/** A tiny in-memory imitation of the GitHub Contents API. */
function fakeGithub() {
  const files = new Map<string, { content: string; sha: number }>();
  let n = 0;
  const calls: { method: string; auth: string | null }[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.replace(/^\/repos\/owner\/data\/contents\/?/, ''));
    const method = init.method ?? 'GET';
    calls.push({ method, auth: (init.headers as Record<string, string>).Authorization ?? null });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (method === 'GET') {
      const f = files.get(p);
      if (f) return json({ sha: String(f.sha), content: Buffer.from(f.content).toString('base64'), encoding: 'base64' });
      const kids = [...files.keys()].filter((k) => k.startsWith(p ? p + '/' : ''));
      if (!kids.length) return json({}, 404);
      const seen = new Set<string>();
      const items: { path: string; type: string }[] = [];
      for (const k of kids) {
        const rest = k.slice(p ? p.length + 1 : 0), first = rest.split('/')[0];
        const full = p ? `${p}/${first}` : first;
        if (seen.has(full)) continue;
        seen.add(full);
        items.push({ path: full, type: rest.includes('/') ? 'dir' : 'file' });
      }
      return json(items);
    }
    const body = JSON.parse(String(init.body));
    const cur = files.get(p);
    if (method === 'PUT') {
      if (cur && body.sha !== String(cur.sha)) return json({}, 409);
      files.set(p, { content: Buffer.from(body.content, 'base64').toString('utf8'), sha: ++n });
      return json({});
    }
    if (method === 'DELETE') {
      if (!cur) return json({}, 404);
      files.delete(p);
      return json({});
    }
    return json({}, 400);
  }) as unknown as typeof fetch;
  return { fetchFn, calls, files };
}

describe('GithubStorage', () => {
  it('satisfies the storage contract with a fake GitHub API', async () => {
    const g = fakeGithub();
    await contract(new GithubStorage({ token: 'tkn', repo: 'owner/data', branch: 'main', fetchFn: g.fetchFn }));
    expect(g.calls.every((c) => c.auth === 'Bearer tkn')).toBe(true);
  });
});

describe('createStorage', () => {
  it('uses local files unless all three GitHub variables are set', () => {
    expect(createStorage({})).toBeInstanceOf(LocalStorage);
    expect(createStorage({ GITHUB_TOKEN: 't', GITHUB_DATA_REPO: 'o/r' })).toBeInstanceOf(LocalStorage);
    expect(createStorage({ GITHUB_TOKEN: 't', GITHUB_DATA_REPO: 'o/r', GITHUB_DATA_BRANCH: 'main' })).toBeInstanceOf(GithubStorage);
  });
});
