import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { assertSafeKey, type Storage } from './types';

/** JSON files under a directory (default ./.data). Writes are atomic (temp file, then rename). */
export class LocalStorage implements Storage {
  constructor(private root: string) {}

  private file(key: string): string {
    assertSafeKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(key), 'utf8')) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
    await fs.rename(tmp, f);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.file(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, rel: string) => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      for (const en of entries) {
        const k = rel ? `${rel}/${en.name}` : en.name;
        if (en.isDirectory()) await walk(path.join(dir, en.name), k);
        else if (!en.name.endsWith('.tmp') && k.startsWith(prefix)) out.push(k);
      }
    };
    await walk(this.root, '');
    return out.sort();
  }
}
