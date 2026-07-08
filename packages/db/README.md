# Database migrations

SQL migrations live in `/supabase/migrations` at the repository root.

## Sprint 0 (foundation)

| Migration              | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `001_extensions.sql`   | uuid-ossp, pg_trgm                                   |
| `002_core_tenancy.sql` | organizations, profiles, org_members, org_invites    |
| `003_workspaces.sql`   | workspaces, workspace_settings, domain_verifications |

## Apply

```bash
npm run db:push
# or
supabase db push
```

See `docs/architecture-freeze/03-DATABASE_FREEZE.md` for full migration order (001–021).
