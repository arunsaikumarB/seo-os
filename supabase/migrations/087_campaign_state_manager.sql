-- 087_campaign_state_manager.sql
-- Campaign State Manager: canonical lifecycle column on opportunities (Campaign Items)

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS campaign_lifecycle TEXT,
  ADD COLUMN IF NOT EXISTS campaign_step TEXT,
  ADD COLUMN IF NOT EXISTS package_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS image_status TEXT DEFAULT 'n/a',
  ADD COLUMN IF NOT EXISTS metadata_status TEXT DEFAULT 'n/a',
  ADD COLUMN IF NOT EXISTS video_metadata_status TEXT DEFAULT 'n/a',
  ADD COLUMN IF NOT EXISTS submission_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_error TEXT;

COMMENT ON COLUMN public.opportunities.campaign_lifecycle IS
  'Campaign State Manager canonical lifecycle. Sole status for derived counters.';

CREATE INDEX IF NOT EXISTS idx_opportunities_campaign_lifecycle
  ON public.opportunities (workspace_id, campaign_lifecycle);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace_domain_lower
  ON public.opportunities (workspace_id, lower(domain));
