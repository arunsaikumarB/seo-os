-- 072_provider_registry.sql
-- Global catalog of interchangeable providers (no vendor lock-in)

CREATE TABLE IF NOT EXISTS public.provider_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  provider_type TEXT NOT NULL
    CHECK (provider_type IN (
      'keyword', 'authority', 'cms', 'image', 'email', 'browser',
      'storage', 'analytics', 'embedding', 'llm', 'search', 'webhook'
    )),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'deprecated', 'disabled', 'beta')),
  priority INT NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_estimated BOOLEAN NOT NULL DEFAULT false,
  cost_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (cost_tier IN ('free', 'free_tier', 'self_hosted', 'paid')),
  auth_modes TEXT[] NOT NULL DEFAULT ARRAY['none']::text[],
  rate_limit_rpm INT,
  docs_url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_registry_type
  ON public.provider_registry(provider_type, priority)
  WHERE deleted_at IS NULL;

ALTER TABLE public.provider_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_registry_select ON public.provider_registry
  FOR SELECT USING (deleted_at IS NULL);

-- Seed catalog (hot-swappable; defaults marked)
INSERT INTO public.provider_registry (provider_key, display_name, provider_type, is_default, is_estimated, cost_tier, priority, capabilities, auth_modes)
VALUES
  ('keyword.estimated', 'Estimated Keywords', 'keyword', true, true, 'free', 10, '["searchVolume","difficulty","related","intent","serp"]'::jsonb, ARRAY['none']),
  ('keyword.google_ads', 'Google Ads Keyword Planner', 'keyword', false, false, 'paid', 20, '["searchVolume","cpc","competition"]'::jsonb, ARRAY['api_key','oauth']),
  ('keyword.dataforseo', 'DataForSEO Keywords', 'keyword', false, false, 'paid', 30, '["searchVolume","difficulty","serp","related"]'::jsonb, ARRAY['api_key']),
  ('keyword.semrush', 'Semrush Keywords', 'keyword', false, false, 'paid', 40, '["searchVolume","difficulty","related"]'::jsonb, ARRAY['api_key']),
  ('keyword.ahrefs', 'Ahrefs Keywords', 'keyword', false, false, 'paid', 50, '["searchVolume","difficulty","related"]'::jsonb, ARRAY['api_key']),
  ('keyword.moz', 'Moz Keywords', 'keyword', false, false, 'paid', 60, '["searchVolume","difficulty"]'::jsonb, ARRAY['api_key']),
  ('keyword.keywords_everywhere', 'Keywords Everywhere', 'keyword', false, false, 'paid', 70, '["searchVolume","cpc","related"]'::jsonb, ARRAY['api_key']),
  ('authority.estimated', 'Estimated Authority', 'authority', true, true, 'free', 10, '["domainAuthority","spam","traffic","backlinks"]'::jsonb, ARRAY['none']),
  ('authority.moz', 'Moz Authority', 'authority', false, false, 'paid', 20, '["domainAuthority","pageAuthority","spam"]'::jsonb, ARRAY['api_key']),
  ('authority.ahrefs', 'Ahrefs Authority', 'authority', false, false, 'paid', 30, '["domainAuthority","backlinks","refDomains","topPages"]'::jsonb, ARRAY['api_key']),
  ('authority.majestic', 'Majestic', 'authority', false, false, 'paid', 40, '["domainAuthority","backlinks","refDomains"]'::jsonb, ARRAY['api_key']),
  ('authority.semrush', 'Semrush Authority', 'authority', false, false, 'paid', 50, '["domainAuthority","traffic","keywords"]'::jsonb, ARRAY['api_key']),
  ('cms.wordpress', 'WordPress', 'cms', false, false, 'free', 10, '["connect","publish","draft","media"]'::jsonb, ARRAY['api_key','oauth']),
  ('cms.ghost', 'Ghost', 'cms', false, false, 'free', 20, '["connect","publish","draft"]'::jsonb, ARRAY['api_key']),
  ('cms.shopify', 'Shopify', 'cms', false, false, 'paid', 30, '["connect","publish","media"]'::jsonb, ARRAY['api_key','oauth']),
  ('cms.webflow', 'Webflow', 'cms', false, false, 'paid', 40, '["connect","publish"]'::jsonb, ARRAY['api_key','oauth']),
  ('cms.strapi', 'Strapi', 'cms', false, false, 'self_hosted', 50, '["connect","publish","draft","media"]'::jsonb, ARRAY['api_key']),
  ('cms.contentful', 'Contentful', 'cms', false, false, 'paid', 60, '["connect","publish","draft"]'::jsonb, ARRAY['api_key']),
  ('cms.sanity', 'Sanity', 'cms', false, false, 'paid', 70, '["connect","publish","draft"]'::jsonb, ARRAY['api_key']),
  ('cms.headless', 'Headless CMS', 'cms', false, false, 'self_hosted', 80, '["connect","publish","draft"]'::jsonb, ARRAY['api_key']),
  ('image.flux', 'FLUX', 'image', true, false, 'self_hosted', 10, '["generate","variation"]'::jsonb, ARRAY['endpoint']),
  ('image.sdxl', 'Stable Diffusion XL', 'image', false, false, 'self_hosted', 20, '["generate","variation"]'::jsonb, ARRAY['endpoint']),
  ('image.comfy', 'ComfyUI', 'image', false, false, 'self_hosted', 30, '["generate","upscale"]'::jsonb, ARRAY['endpoint']),
  ('image.openai', 'OpenAI Images', 'image', false, false, 'paid', 40, '["generate"]'::jsonb, ARRAY['api_key']),
  ('image.gemini', 'Gemini Images', 'image', false, false, 'paid', 50, '["generate"]'::jsonb, ARRAY['api_key']),
  ('image.firefly', 'Adobe Firefly', 'image', false, false, 'paid', 60, '["generate"]'::jsonb, ARRAY['oauth']),
  ('image.a1111', 'AUTOMATIC1111', 'image', false, false, 'self_hosted', 70, '["generate"]'::jsonb, ARRAY['endpoint']),
  ('email.smtp', 'SMTP', 'email', true, false, 'free', 10, '["send","draft","attachments"]'::jsonb, ARRAY['password']),
  ('email.gmail', 'Google OAuth Email', 'email', false, false, 'free', 20, '["send","draft","templates"]'::jsonb, ARRAY['oauth']),
  ('email.outlook', 'Microsoft OAuth Email', 'email', false, false, 'free', 30, '["send","draft"]'::jsonb, ARRAY['oauth']),
  ('email.mailgun', 'Mailgun', 'email', false, false, 'paid', 40, '["send","tracking"]'::jsonb, ARRAY['api_key']),
  ('email.sendgrid', 'SendGrid', 'email', false, false, 'paid', 50, '["send","tracking"]'::jsonb, ARRAY['api_key']),
  ('email.ses', 'AWS SES', 'email', false, false, 'paid', 60, '["send"]'::jsonb, ARRAY['api_key']),
  ('email.resend', 'Resend', 'email', false, false, 'paid', 70, '["send"]'::jsonb, ARRAY['api_key']),
  ('browser.playwright', 'Playwright', 'browser', true, false, 'self_hosted', 10, '["navigate","fill","screenshot"]'::jsonb, ARRAY['none']),
  ('browser.puppeteer', 'Puppeteer', 'browser', false, false, 'self_hosted', 20, '["navigate","fill","screenshot"]'::jsonb, ARRAY['none']),
  ('browser.selenium', 'Selenium', 'browser', false, false, 'self_hosted', 30, '["navigate","fill"]'::jsonb, ARRAY['none']),
  ('browser.cloud', 'Cloud Browser', 'browser', false, false, 'paid', 40, '["navigate","fill","screenshot"]'::jsonb, ARRAY['api_key']),
  ('storage.supabase', 'Supabase Storage', 'storage', true, false, 'free', 10, '["upload","download","delete"]'::jsonb, ARRAY['api_key']),
  ('storage.s3', 'AWS S3', 'storage', false, false, 'paid', 20, '["upload","download","delete"]'::jsonb, ARRAY['api_key']),
  ('storage.r2', 'Cloudflare R2', 'storage', false, false, 'paid', 30, '["upload","download","delete"]'::jsonb, ARRAY['api_key']),
  ('storage.azure', 'Azure Blob', 'storage', false, false, 'paid', 40, '["upload","download","delete"]'::jsonb, ARRAY['api_key']),
  ('storage.gcs', 'Google Cloud Storage', 'storage', false, false, 'paid', 50, '["upload","download","delete"]'::jsonb, ARRAY['api_key']),
  ('analytics.ga4', 'Google Analytics 4', 'analytics', false, false, 'free', 10, '["pageviews","events"]'::jsonb, ARRAY['oauth']),
  ('analytics.gsc', 'Google Search Console', 'analytics', false, false, 'free', 20, '["queries","pages"]'::jsonb, ARRAY['oauth']),
  ('analytics.clarity', 'Microsoft Clarity', 'analytics', false, false, 'free', 30, '["sessions","heatmaps"]'::jsonb, ARRAY['api_key']),
  ('analytics.plausible', 'Plausible', 'analytics', false, false, 'paid', 40, '["pageviews"]'::jsonb, ARRAY['api_key']),
  ('analytics.matomo', 'Matomo', 'analytics', false, false, 'self_hosted', 50, '["pageviews","events"]'::jsonb, ARRAY['api_key']),
  ('llm.gemini', 'Gemini', 'llm', true, false, 'free_tier', 10, '["chat","completion","embeddings","vision"]'::jsonb, ARRAY['api_key']),
  ('llm.openai', 'OpenAI', 'llm', false, false, 'paid', 20, '["chat","completion","embeddings","vision"]'::jsonb, ARRAY['api_key']),
  ('llm.ollama', 'Ollama', 'llm', false, false, 'self_hosted', 30, '["chat","completion","embeddings"]'::jsonb, ARRAY['endpoint']),
  ('llm.claude', 'Claude', 'llm', false, false, 'paid', 40, '["chat","completion","vision"]'::jsonb, ARRAY['api_key']),
  ('llm.mistral', 'Mistral', 'llm', false, false, 'paid', 50, '["chat","completion"]'::jsonb, ARRAY['api_key']),
  ('llm.deepseek', 'DeepSeek', 'llm', false, false, 'paid', 60, '["chat","completion"]'::jsonb, ARRAY['api_key']),
  ('llm.openrouter', 'OpenRouter', 'llm', false, false, 'paid', 70, '["chat","completion"]'::jsonb, ARRAY['api_key']),
  ('embedding.gemini', 'Gemini Embeddings', 'embedding', true, false, 'free_tier', 10, '["embed"]'::jsonb, ARRAY['api_key']),
  ('embedding.openai', 'OpenAI Embeddings', 'embedding', false, false, 'paid', 20, '["embed"]'::jsonb, ARRAY['api_key']),
  ('embedding.ollama', 'Ollama Embeddings', 'embedding', false, false, 'self_hosted', 30, '["embed"]'::jsonb, ARRAY['endpoint']),
  ('search.google_cse', 'Google Custom Search', 'search', false, false, 'free_tier', 10, '["webSearch"]'::jsonb, ARRAY['api_key']),
  ('search.bing', 'Bing Search', 'search', false, false, 'paid', 20, '["webSearch"]'::jsonb, ARRAY['api_key']),
  ('search.brave', 'Brave Search', 'search', false, false, 'free_tier', 30, '["webSearch"]'::jsonb, ARRAY['api_key']),
  ('search.serpapi', 'SerpAPI', 'search', false, false, 'paid', 40, '["webSearch","serp"]'::jsonb, ARRAY['api_key']),
  ('webhook.generic', 'Generic Webhook', 'webhook', true, false, 'free', 10, '["dispatch"]'::jsonb, ARRAY['none'])
ON CONFLICT (provider_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  capabilities = EXCLUDED.capabilities,
  priority = EXCLUDED.priority,
  updated_at = now();
