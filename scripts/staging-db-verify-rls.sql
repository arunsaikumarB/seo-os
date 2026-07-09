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
