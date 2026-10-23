-- F4 (R5/MED): at most one open physical-cash session.
-- The check-then-insert in openSession/ensureOpenSession is not enough under
-- concurrency: two callers could each create an `open` row, leaving an orphan
-- drawer and overlapping arqueo windows. This partial unique index makes the
-- second insert conflict; the app catches it (ON CONFLICT DO NOTHING) and
-- reuses the winning session.
--
-- Additive and idempotent; creates no rows. If duplicate open rows already
-- exist, the index creation fails loudly instead of silently dropping data.

CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_open_uq"
  ON "cash_sessions" ("status")
  WHERE "status" = 'open';
