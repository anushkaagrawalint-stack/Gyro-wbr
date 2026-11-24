import path from 'node:path';
import { GithubStorage } from './github';
import { LocalStorage } from './local';
import type { Storage } from './types';

export type { Storage } from './types';

/** GitHub when GITHUB_TOKEN, GITHUB_DATA_REPO and GITHUB_DATA_BRANCH are all set, otherwise local files. */
export function createStorage(env: Record<string, string | undefined> = process.env): Storage {
  const { GITHUB_TOKEN, GITHUB_DATA_REPO, GITHUB_DATA_BRANCH } = env;
  if (GITHUB_TOKEN && GITHUB_DATA_REPO && GITHUB_DATA_BRANCH) {
    return new GithubStorage({ token: GITHUB_TOKEN, repo: GITHUB_DATA_REPO, branch: GITHUB_DATA_BRANCH });
  }
  return new LocalStorage(path.resolve(env.DATA_DIR || '.data'));
}

const g = globalThis as unknown as { __wbrStorage?: Storage };
/** One instance per server process. */
export function storage(): Storage {
  return (g.__wbrStorage ??= createStorage());
}
