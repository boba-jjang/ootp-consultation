import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.ts';

/** A Supabase client typed by the schema generated from supabase/migrations. */
export type Client = SupabaseClient<Database>;

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Null when the build has no Supabase settings, so the page can say so instead of crashing. */
export const supabase: Client | null =
  url && key ? createClient<Database>(url, key, { auth: { flowType: 'pkce' } }) : null;

/** The project ref (the subdomain of the project URL), to show which database is in use. */
export const projectRef = url ? new URL(url).hostname.split('.')[0] : undefined;
