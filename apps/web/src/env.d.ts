interface ImportMetaEnv {
  /** Supabase project URL. Public: it ships to the browser. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key. Public by design; row-level security protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
