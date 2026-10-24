-- 0026_zernio_channels.sql — extend the channel enum with the remaining
-- Zernio connect platforms (linkedin, tiktok, youtube, threads, pinterest,
-- discord, slack). Idempotent: ADD VALUE IF NOT EXISTS is safe to re-run.
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'threads';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'discord';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'slack';
