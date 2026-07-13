-- 064_image_submission_requirements.sql

CREATE TABLE IF NOT EXISTS public.image_submission_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  site_key TEXT NOT NULL,
  site_name TEXT NOT NULL,
  site_url TEXT,
  supported_formats TEXT[] NOT NULL DEFAULT ARRAY['jpg','png','webp'],
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_bytes INT,
  required_ratio TEXT,
  categories_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_count_min INT DEFAULT 1,
  image_count_max INT,
  logo_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  watermark_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_review_hours NUMERIC(8,2),
  estimated_approval_rate NUMERIC(5,2),
  metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_image_sub_req_site
  ON public.image_submission_requirements(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), site_key)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_submission_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_submission_requirements_all ON public.image_submission_requirements
  FOR ALL USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );

INSERT INTO public.image_submission_requirements (site_key, site_name, site_url, dimensions, max_bytes, estimated_review_hours, estimated_approval_rate)
SELECT * FROM (VALUES
  ('pinterest', 'Pinterest', 'https://pinterest.com', '{"preferred":[{"w":1000,"h":1500}]}'::jsonb, 20971520, 24::numeric, 65::numeric),
  ('flickr', 'Flickr', 'https://flickr.com', '{"preferred":[{"w":1600,"h":900}]}'::jsonb, 52428800, 12::numeric, 70::numeric),
  ('imgur', 'Imgur', 'https://imgur.com', '{"preferred":[{"w":1200,"h":630}]}'::jsonb, 20971520, 1::numeric, 80::numeric),
  ('behance', 'Behance', 'https://behance.net', '{"preferred":[{"w":1400,"h":980}]}'::jsonb, 52428800, 48::numeric, 55::numeric),
  ('dribbble', 'Dribbble', 'https://dribbble.com', '{"preferred":[{"w":1600,"h":1200}]}'::jsonb, 10485760, 72::numeric, 50::numeric),
  ('500px', '500px', 'https://500px.com', '{"preferred":[{"w":1920,"h":1080}]}'::jsonb, 52428800, 24::numeric, 60::numeric),
  ('medium_images', 'Medium Images', 'https://medium.com', '{"preferred":[{"w":1400,"h":788}]}'::jsonb, 10485760, 6::numeric, 75::numeric),
  ('business_directories', 'Business Directories', NULL::text, '{"preferred":[{"w":512,"h":512},{"w":1200,"h":630}]}'::jsonb, 5242880, 72::numeric, 58::numeric),
  ('local_directories', 'Local Directories', NULL::text, '{"preferred":[{"w":512,"h":512}]}'::jsonb, 2097152, 96::numeric, 62::numeric),
  ('industry_portals', 'Industry Portals', NULL::text, '{"preferred":[{"w":1200,"h":630}]}'::jsonb, 10485760, 48::numeric, 55::numeric)
) AS v(site_key, site_name, site_url, dimensions, max_bytes, estimated_review_hours, estimated_approval_rate)
WHERE NOT EXISTS (
  SELECT 1 FROM public.image_submission_requirements r WHERE r.site_key = v.site_key AND r.workspace_id IS NULL
);
