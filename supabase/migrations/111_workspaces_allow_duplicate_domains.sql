-- Allow multiple projects (workspaces) per org to share the same domain.
-- Projects are identified by id/name; domain is metadata, not a uniqueness key.

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_org_id_domain_key;

-- Non-unique index for lookups / filters by org + domain
CREATE INDEX IF NOT EXISTS idx_workspaces_org_domain
  ON public.workspaces (org_id, lower(domain));
