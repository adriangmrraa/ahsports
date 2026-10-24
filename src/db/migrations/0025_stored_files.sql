-- STORAGE_PROVIDER=db: file bytes live in Postgres because Render's
-- filesystem is ephemeral (uploads die on every redeploy) and external object
-- storage is out of scope. `path` is the adapter relPath (e.g.
-- `orders/<id>/rand-name.png`, `media/<scope>/<file>`).
-- scope 'public' → served by /api/files/[...path] (attachments, product images)
-- scope 'media'  → served by the session-gated /api/media/[...path]
--
-- NOTE: rows uploaded before this change keep legacy `/uploads/...` URLs that
-- referenced files on the old (ephemeral) disk — they won't resolve under
-- STORAGE_PROVIDER=db. Left as-is on purpose.
--
-- Additive and idempotent; creates no rows.

CREATE TABLE IF NOT EXISTS "stored_files" (
  "path" text PRIMARY KEY,
  "scope" text NOT NULL,
  "mime" text NOT NULL,
  "bytes" bytea NOT NULL,
  "size" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stored_files_scope_idx"
  ON "stored_files" ("scope");
