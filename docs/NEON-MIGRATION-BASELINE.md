# Neon migration baseline

The repository previously had no Drizzle migration journal. Before running
`npm run db:migrate` against an existing Neon database, take a backup and
compare `src/db/schema.ts` with the deployed schema. Mark the already-existing
base schema as reconciled, then apply `0001_public_upload_sessions.sql` in
staging first.

Do not use `db:push` in production. The upload-session migration is additive
and leaves existing attachment URLs untouched; provider storage keys need a
separate, reviewed backfill once durable object storage is selected.
