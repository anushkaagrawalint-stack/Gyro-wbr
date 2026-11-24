/** Everything the app saves goes through this. Values are JSON; keys look like "config/people.json". */
export interface Storage {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys that start with `prefix` (e.g. "weeks/"), sorted. */
  list(prefix: string): Promise<string[]>;
}

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._ -]*(\/[A-Za-z0-9][A-Za-z0-9._ -]*)*$/;
export function assertSafeKey(key: string): void {
  if (!SAFE.test(key) || key.includes('..')) throw new Error(`Unsafe storage key: ${key}`);
}
