-- Baseline: the start of the migration history. No schema changes.
--
-- Server-wide settings for the small Railway instance (shared_buffers, max_connections, …) were
-- applied once with ALTER SYSTEM, which can't run inside a migration's transaction. They are
-- documented in docs/database.md. Tables arrive in later migrations (accounts first).
SELECT 1;
