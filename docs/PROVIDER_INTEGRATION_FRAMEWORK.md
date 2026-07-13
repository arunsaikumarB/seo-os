# Provider Integration Framework (PIF)

**Status:** Implemented in SEO OS v1.2.3  
**Package:** `@seo-os/providers` → `framework/`  
**Extends:** existing AI, Email, Image, Integrations crypto — does **not** rebuild modules

## Architecture

```
SEO OS → ProviderManager → Registry → Interfaces → Adapters → Services → Modules
```

Hot-swappable. No vendor hardcoding in routes/UI. Failover: preferred → configured fallbacks → **Estimated**.

## Defaults

| Type | Default |
|------|---------|
| Keyword | `keyword.estimated` |
| Authority | `authority.estimated` |
| Image | `image.flux` (IIE) |
| Browser | `browser.playwright` (BEE) |
| Email | `email.smtp` |
| LLM | `llm.gemini` |
| Storage | `storage.supabase` |
| Analytics / CMS | none until connected |

## Database (072–080)

`provider_registry`, `provider_configs`, `provider_health`, `provider_usage`, `provider_failover`, `provider_metrics`, `provider_credentials` (encrypted; client SELECT denied), `provider_capabilities`, `provider_logs`

## Feature flags

`provider_keyword`, `provider_authority`, `provider_cms`, `provider_image`, `provider_email`, `provider_browser`, `provider_llm`, `provider_search`

## API (`/v1/projects/:projectId`)

**GET** `/providers` · `/providers/types` · `/providers/health` · `/providers/statistics` · `/providers/capabilities` · `/providers/logs` · `/providers/reports?format=json|csv|xlsx|pdf`

**POST** `/providers/connect` · `/disconnect` · `/test` · `/enable` · `/disable` · `/failover` · `/configure` · `/workers/refresh`

## Workers (LOW queue)

`provider_health`, `provider_quota`, `provider_metrics`, `provider_usage`, `provider_failover`, `provider_retry`

## UI

- **Provider Dashboard** — `/projects/:id/providers` (configuration, health, logs, metrics, credentials, testing)
- **Mission Control** — Provider Health widget

## Env keys (examples)

`KEYWORD_*_KEY`, `AUTHORITY_*_KEY`, `IMAGE_FLUX_URL`, `GEMINI_API_KEY`, `SMTP_HOST`, `SEARCH_*_KEY`, `CMS_*`, `STORAGE_*`, `ANALYTICS_*`, `EMAIL_*`

## Security

Credentials via `@seo-os/integrations` `encryptSecret` (AES-256-GCM). Org/workspace isolation + RLS. Audit rows in `provider_logs`.
