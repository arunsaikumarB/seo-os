-- V1.1 Phase 6: Specialized workforce agent definitions

INSERT INTO agent_definitions (agent_type, display_name, description, sync_mode, default_approval, output_schema_id, is_active)
VALUES
  ('discovery_agent', 'Discovery Agent', 'Discovers backlink opportunity websites from niche signals', 'async', 'none', 'discovery_v11', true),
  ('website_analyzer_agent', 'Website Analyzer Agent', 'Analyzes target websites for submission fit', 'async', 'none', 'analyzer_v11', true),
  ('keyword_agent', 'Keyword Agent', 'Discovers and clusters project keywords', 'async', 'none', 'keyword_v11', true),
  ('content_agent', 'Content Agent', 'Generates editable content packs by backlink type', 'async', 'review', 'content_v11', true),
  ('submission_agent', 'Submission Agent', 'Prepares submission requirements and prefill payloads', 'async', 'required', 'submission_v11', true),
  ('relationship_agent', 'Relationship Agent', 'Scores publisher relationships and next actions', 'async', 'none', 'relationship_v11', true),
  ('verification_agent', 'Verification Agent', 'Verifies live backlinks and flags losses', 'async', 'none', 'verification_v11', true),
  ('campaign_agent', 'Campaign Agent', 'Orchestrates campaign queue priorities', 'async', 'review', 'campaign_v11', true),
  ('reporting_agent', 'Reporting Agent', 'Builds operational backlink reports', 'async', 'none', 'reporting_v11', true)
ON CONFLICT (agent_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = true;
