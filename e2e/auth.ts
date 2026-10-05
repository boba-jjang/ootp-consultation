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

/** Deletes the user's teams that match the filter; snapshots and files cascade. */
async function deleteTeams(env: SupabaseEnv, session: Session, filter: string): Promise<void> {
  const response = await fetch(`${env.url}/rest/v1/teams?${filter}`, {
    method: 'DELETE',
    headers: { apikey: env.key, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Couldn't delete the test teams (${response.status}): ${await response.text()}`,
    );
  }
}

/** Deletes the one team of that name, this run's own. */
export const deleteTeamNamed = (env: SupabaseEnv, session: Session, name: string) =>
  deleteTeams(env, session, `name=eq.${encodeURIComponent(name)}`);

/**
 * Deletes teams with the prefix left behind by runs that died, once they're an hour old: a
 * run still going, in another project or another workflow, keeps its team.
 */
export const deleteStaleTeams = (env: SupabaseEnv, session: Session, prefix: string) =>
  deleteTeams(
    env,
    session,
    `name=like.${encodeURIComponent(prefix)}*&created_at=lt.${new Date(Date.now() - 3_600_000).toISOString()}`,
  );
