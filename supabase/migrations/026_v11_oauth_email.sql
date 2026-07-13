-- V1.1 Phase 5: OAuth email sync fields

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS oauth_provider TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
  ADD COLUMN IF NOT EXISTS last_inbox_sync_at TIMESTAMPTZ;

ALTER TABLE integration_connections
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
  ADD COLUMN IF NOT EXISTS last_inbox_sync_at TIMESTAMPTZ;
