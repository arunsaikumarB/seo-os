-- Enterprise Project Management: impact counts, transactional reset, hard delete RPC

CREATE OR REPLACE FUNCTION public.seo_os_workspace_ref_tables()
RETURNS TABLE(table_name text, column_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.relname::text AS table_name, a.attname::text AS column_name
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
  WHERE n.nspname = 'public'
    AND con.contype = 'f'
    AND con.confrelid = 'public.workspaces'::regclass
    AND a.attname IN ('workspace_id', 'project_id')
    AND c.relkind = 'r';
$$;

CREATE OR REPLACE FUNCTION public.seo_os_count_workspace_impact(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt bigint;
  categories jsonb := '{}'::jsonb;
  by_table jsonb := '{}'::jsonb;
  total bigint := 0;
  cat text;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required';
  END IF;

  categories := jsonb_build_object(
    'imported_urls', 0,
    'ai_analysis', 0,
    'opportunity_queue', 0,
    'content_packs', 0,
    'image_assets', 0,
    'video_assets', 0,
    'submission_queue', 0,
    'browser_executions', 0,
    'reports', 0,
    'verification_history', 0,
    'ai_learning', 0,
    'campaigns', 0,
    'other', 0
  );

  FOR r IN SELECT * FROM public.seo_os_workspace_ref_tables() LOOP
    EXECUTE format(
      'SELECT count(*)::bigint FROM public.%I WHERE %I = $1',
      r.table_name,
      r.column_name
    ) INTO cnt USING p_workspace_id;

    IF cnt > 0 THEN
      by_table := by_table || jsonb_build_object(r.table_name, cnt);
      total := total + cnt;

      cat := CASE
        WHEN r.table_name IN (
          'backlink_imports', 'backlink_import_rows'
        ) THEN 'imported_urls'
        WHEN r.table_name IN (
          'backlink_domain_analyses', 'website_profiles', 'research_events',
          'browser_intelligence_discoveries', 'website_scans', 'website_pages',
          'browser_scan_cache'
        ) THEN 'ai_analysis'
        WHEN r.table_name IN (
          'opportunities', 'prospects', 'backlink_type_recommendations'
        ) THEN 'opportunity_queue'
        WHEN r.table_name IN (
          'content_packs', 'content_drafts', 'email_drafts', 'media_asset_briefs',
          'approvals', 'backlink_ai_drafts'
        ) THEN 'content_packs'
        WHEN r.table_name IN (
          'image_assets', 'image_metadata', 'image_generation_jobs',
          'image_statistics', 'image_submission_history',
          'image_submission_requirements', 'domain_style_profiles'
        ) THEN 'image_assets'
        WHEN r.table_name IN (
          'backlink_submissions', 'submission_requirements',
          'backlink_submission_events'
        ) THEN 'submission_queue'
        WHEN r.table_name IN (
          'browser_sessions', 'execution_jobs', 'execution_steps',
          'execution_logs', 'execution_assets', 'execution_history',
          'execution_statistics', 'browser_action_plans',
          'browser_assist_sessions'
        ) THEN 'browser_executions'
        WHEN r.table_name LIKE 'report%' OR r.table_name IN (
          'analytics_snapshots', 'analytics_insights', 'analytics_exports',
          'executive_reports'
        ) THEN 'reports'
        WHEN r.table_name IN (
          'backlink_checks', 'backlink_history', 'backlinks',
          'backlink_notes', 'backlink_tags', 'backlink_relationships',
          'backlink_automation_runs', 'backlink_automation_run_logs',
          'backlink_automation_analytics'
        ) THEN 'verification_history'
        WHEN r.table_name IN (
          'memory_entries', 'memory_facts', 'image_learning',
          'selector_memory', 'kb_documents', 'kb_chunks', 'kb_embeddings',
          'kb_ingestion_jobs', 'ai_conversations', 'ai_messages',
          'agent_runs', 'ai_usage_ledger', 'ai_events'
        ) THEN 'ai_learning'
        WHEN r.table_name IN (
          'campaigns', 'campaign_timeline_events', 'campaign_opportunities'
        ) THEN 'campaigns'
        WHEN r.table_name IN (
          'workspace_settings', 'domain_verifications', 'ai_settings',
          'provider_configs', 'provider_credentials', 'image_provider_settings',
          'integration_connections', 'integration_credentials',
          'campaign_templates', 'execution_policies', 'execution_profiles'
        ) THEN 'other'
        ELSE 'other'
      END;

      categories := jsonb_set(
        categories,
        ARRAY[cat],
        to_jsonb(COALESCE((categories ->> cat)::bigint, 0) + cnt)
      );
    END IF;
  END LOOP;

  -- Prefer precise video brief count (best-effort)
  BEGIN
    SELECT count(*)::bigint INTO cnt
    FROM public.media_asset_briefs
    WHERE workspace_id = p_workspace_id
      AND coalesce(kind, '') ILIKE '%video%';
    categories := jsonb_set(categories, ARRAY['video_assets'], to_jsonb(COALESCE(cnt, 0)));
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    categories := jsonb_set(categories, ARRAY['video_assets'], to_jsonb(0));
  END;

  RETURN jsonb_build_object(
    'workspaceId', p_workspace_id,
    'totalRecords', total,
    'categories', categories,
    'byTable', by_table
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_os_reset_workspace(
  p_workspace_id uuid,
  p_clear_ai_learning boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  keep text[] := ARRAY[
    'workspace_settings',
    'domain_verifications',
    'ai_settings',
    'provider_configs',
    'provider_credentials',
    'image_provider_settings',
    'integration_connections',
    'integration_credentials',
    'campaign_templates',
    'execution_policies',
    'execution_profiles'
  ];
  learning text[] := ARRAY[
    'memory_entries',
    'memory_facts',
    'image_learning',
    'selector_memory',
    'domain_style_profiles'
  ];
  deleted_total bigint := 0;
  deleted_here bigint;
  before jsonb;
  after jsonb;
  attempt int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  before := public.seo_os_count_workspace_impact(p_workspace_id);

  IF NOT p_clear_ai_learning THEN
    keep := keep || learning;
  END IF;

  -- Retry passes to satisfy child FK order between workspace-scoped tables
  FOR attempt IN 1..25 LOOP
    FOR r IN
      SELECT * FROM public.seo_os_workspace_ref_tables() t
      WHERE NOT (t.table_name = ANY (keep))
      ORDER BY t.table_name DESC
    LOOP
      BEGIN
        EXECUTE format(
          'WITH d AS (DELETE FROM public.%I WHERE %I = $1 RETURNING 1)
           SELECT count(*)::bigint FROM d',
          r.table_name,
          r.column_name
        ) INTO deleted_here USING p_workspace_id;
        deleted_total := deleted_total + COALESCE(deleted_here, 0);
      EXCEPTION
        WHEN foreign_key_violation THEN
          NULL; -- retry next pass
      END;
    END LOOP;
  END LOOP;

  -- Strip optional AI learning blobs from settings but keep settings row
  IF p_clear_ai_learning THEN
    UPDATE public.workspace_settings
    SET memory_config = COALESCE(memory_config, '{}'::jsonb)
      - 'classification_learning'
      - 'content_requirement_learning'
      - 'learning'
      - 'patterns',
      updated_at = now()
    WHERE workspace_id = p_workspace_id;
  END IF;

  after := public.seo_os_count_workspace_impact(p_workspace_id);

  UPDATE public.workspaces SET updated_at = now() WHERE id = p_workspace_id;

  RETURN jsonb_build_object(
    'workspaceId', p_workspace_id,
    'clearAiLearning', p_clear_ai_learning,
    'deletedRecords', deleted_total,
    'before', before,
    'after', after
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_os_delete_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  impact jsonb;
  org uuid;
BEGIN
  SELECT org_id INTO org FROM public.workspaces WHERE id = p_workspace_id;
  IF org IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  impact := public.seo_os_count_workspace_impact(p_workspace_id);

  -- CASCADE removes child rows with ON DELETE CASCADE FKs
  DELETE FROM public.workspaces WHERE id = p_workspace_id;

  RETURN jsonb_build_object(
    'workspaceId', p_workspace_id,
    'orgId', org,
    'deletedWorkspace', true,
    'impact', impact,
    'totalRecordsRemoved', COALESCE((impact ->> 'totalRecords')::bigint, 0) + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_os_workspace_ref_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seo_os_count_workspace_impact(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seo_os_reset_workspace(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seo_os_delete_workspace(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.seo_os_workspace_ref_tables() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_os_count_workspace_impact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_os_reset_workspace(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_os_delete_workspace(uuid) TO service_role;
