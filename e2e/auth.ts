import type { Page } from '@playwright/test';

import type { SupabaseEnv, TestUser } from './env.ts';

/** What Supabase Auth answers a password sign-in with, as auth-js stores it. */
export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: unknown;
}

/**
 * Signs the staging test user in with a password, which the app itself never offers (it
 * signs in with GitHub only). The session goes where auth-js keeps it, so the app wakes up
 * signed in.
 */
export async function signIn(env: SupabaseEnv, user: TestUser): Promise<Session> {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed (${response.status}): ${await response.text()}`);
  }
  const session = (await response.json()) as Session;
  return {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + session.expires_in,
  };
}

/** Stores the session before the app loads, under auth-js's key for the project. */
export async function withSession(page: Page, env: SupabaseEnv, session: Session): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: `sb-${env.ref}-auth-token`, value: JSON.stringify(session) },
  );
}

/** Deletes the user's teams whose names start with the prefix; snapshots and files cascade. */
export async function deleteTeamsNamed(
  env: SupabaseEnv,
  session: Session,
  prefix: string,
): Promise<void> {
  const response = await fetch(
    `${env.url}/rest/v1/teams?name=like.${encodeURIComponent(prefix)}*`,
    {
      method: 'DELETE',
      headers: { apikey: env.key, Authorization: `Bearer ${session.access_token}` },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Couldn't delete the test teams (${response.status}): ${await response.text()}`,
    );
  }
}
