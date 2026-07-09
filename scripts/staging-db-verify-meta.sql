SELECT
  (SELECT COUNT(*)::int FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public') AS fk_count,
  (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public') AS index_count,
  (SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss')) AS pgboss_schema_exists;
