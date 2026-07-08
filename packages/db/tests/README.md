# RLS Integration Tests

Row-level security tests ship in **Sprint 1** with migration `018_rls`.

## Planned coverage

- User A cannot read User B's organization
- User A cannot read User B's workspace (project)
- Role hierarchy enforcement on write operations
- Service role + mandatory `workspace_id` filter in workers

## Run (Sprint 1+)

```bash
npm run test --workspace=@seo-os/db
```
