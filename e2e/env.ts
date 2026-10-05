import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The tests' settings. Locally they come from apps/web/.env.local, the file the dev server
 * reads; in CI the workflow sets them. The signed-in tests also need the staging test user
 * (docs/implementation-plan.md › Testing and quality).
 */
export interface SupabaseEnv {
  url: string;
  key: string;
  /** "kcmjeivksnptmvemusma", the first label of the project host. */
  ref: string;
}

export interface TestUser {
  email: string;
  password: string;
}

const LOCAL_ENV = fileURLToPath(new URL('../apps/web/.env.local', import.meta.url));

/** Fills process.env from apps/web/.env.local where it says nothing yet. */
export function loadLocalEnv(): void {
  if (!existsSync(LOCAL_ENV)) {
    return;
  }
  for (const line of readFileSync(LOCAL_ENV, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] && match[2] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

export function supabaseEnv(): SupabaseEnv | null {
  loadLocalEnv();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return null;
  }
  return { url, key, ref: new URL(url).hostname.split('.')[0] ?? '' };
}

export function testUser(): TestUser | null {
  loadLocalEnv();
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  return email && password ? { email, password } : null;
}
