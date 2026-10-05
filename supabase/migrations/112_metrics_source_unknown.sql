-- Authority that was not measured is unknown, not estimated and not live.

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_metrics_source_check;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_metrics_source_check
  CHECK (metrics_source IN ('estimated', 'live', 'user', 'unknown'));

ALTER TABLE backlink_domain_analyses DROP CONSTRAINT IF EXISTS backlink_domain_analyses_metrics_source_check;
ALTER TABLE backlink_domain_analyses
  ADD CONSTRAINT backlink_domain_analyses_metrics_source_check
  CHECK (metrics_source IN ('estimated', 'live', 'user', 'unknown'));
