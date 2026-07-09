SELECT COUNT(*)::int AS migration_count FROM supabase_migrations.schema_migrations;

SELECT tablename, rowsecurity::text AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'workspaces',
    'org_members',
    'kb_documents',
    'campaigns',
    'opportunities',
    'relationship_organizations',
    'outreach_messages'
  )
ORDER BY tablename;

SELECT EXISTS (
  SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss'
) AS pgboss_schema_exists;

SELECT COUNT(*)::int AS fk_count
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'public';

SELECT COUNT(*)::int AS index_count
FROM pg_indexes
WHERE schemaname = 'public';

SELECT proname
FROM pg_proc
JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'auth_user_id',
    'is_org_member',
    'has_org_role',
    'can_access_workspace'
  )
ORDER BY proname;
