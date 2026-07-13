-- 071_image_intelligence_agent.sql
-- Seed Image Intelligence Agent into AI Workforce

INSERT INTO agent_definitions (agent_type, display_name, description, sync_mode, default_approval, output_schema_id, is_active)
VALUES
  (
    'image_intelligence_agent',
    'Image Intelligence Agent',
    'Studies project/brand/niche, builds style profiles and prompts, and prepares SEO image packages for backlink campaigns',
    'async',
    'review',
    'image_intelligence_v13',
    true
  )
ON CONFLICT (agent_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  output_schema_id = EXCLUDED.output_schema_id,
  is_active = true;
