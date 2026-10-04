# Database

- Change the schema only by adding a new file to `supabase/migrations/`. Never edit a migration that has run.
- Keep each migration backward compatible. On merge, Vercel and `db.yml` deploy in parallel, so the old app must work with the new schema: add first, use it in the next release, drop later.
- Every table carries `id`, `owner_id` (defaulting to the caller) and `created_at`, with row-level security on and the policy `owner_id = (select auth.uid())`.
- Add pgTAP tests in `supabase/tests/database/`: the owner can read and write; a second user and an anonymous caller see nothing. They need Docker, so CI's `db` job runs them.
- Raw export files are stored verbatim. The browser recomputes derived data, so it gets no tables of its own.
- Production data and the Supabase dashboard belong to the owner. List any step there as a blocking preparation gap.
