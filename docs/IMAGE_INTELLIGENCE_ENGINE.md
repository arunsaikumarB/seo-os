# Image Intelligence Engine (IIE)

**Status:** Implemented in SEO OS v1.2.2  
**Extends:** Content Studio · Asset Library · Backlink Builder · Mission Control  
**Default:** Generation **OFF** (`v13_image_generation=false`) until a provider gateway is configured.

## Pipeline

```
Project → Image Intelligence Agent → Domain Style → Prompt Engine
  → Image Provider (registry) → Quality Engine → Metadata Engine
  → Asset Library → Submission Package → Mission Control → Learning
```

## Database (061–071)

| Migration | Purpose |
|-----------|---------|
| 061 | `image_assets` |
| 062 | `image_generation_jobs` |
| 063 | `image_metadata` |
| 064 | `image_submission_requirements` (+ seed sites) |
| 065 | `image_submission_history` |
| 066 | `image_provider_settings` |
| 067 | `image_prompt_library` |
| 068 | `domain_style_profiles` |
| 069 | `image_learning` |
| 070 | `image_statistics` |
| 071 | `image_intelligence_agent` workforce seed |

All tables: indexes, FKs, soft delete (`deleted_at` where applicable), RLS (org via workspace membership).

## Providers (`@seo-os/providers`)

Never hardcode a vendor in routes/UI. Use `createImageProviderRegistry()`.

| Key | Class | Env |
|-----|-------|-----|
| `flux` | FluxProvider (default) | `IMAGE_FLUX_URL` |
| `sdxl` | StableDiffusionXLProvider (fallback) | `IMAGE_SDXL_URL` |
| `comfy` | ComfyUIProvider | `IMAGE_COMFY_URL` + `v13_comfy` |
| openai / gemini / firefly / a1111 | Future stubs | — |

Optional: `IMAGE_PROVIDER_DEFAULT`, `IMAGE_PROVIDER_API_KEY`.

Without a gateway URL, providers emit a **local SVG draft** so the pipeline can run; the Quality Engine **rejects** drafts for Ready/photo submissions.

## Feature flags

| Flag | Default |
|------|---------|
| `v13_image_generation` | **false** |
| `v13_flux` | true |
| `v13_sdxl` | true |
| `v13_comfy` | false |

## API (`/v1/projects/:projectId`)

**POST** (requires `v13_image_generation`):  
`/images/generate` · `/images/regenerate` · `/images/variation` · `/images/upscale` · `/images/remove-background` · `/images/prepare-submission` · `/images/replay` · `PATCH /images/:id/review`

**GET** (always available for library/ops):  
`/images` · `/images/jobs` · `/images/providers` · `/images/statistics` · `/images/style-profile` · `/images/sites` · `/images/reports?format=json|csv|xlsx|pdf`

## Workers (queue `LOW`)

- `image_generate` — generate / variation / regenerate
- `image_learning` — prompt performance + learning rows
- `image_cleanup` / `image_statistics` — daily rollups

## UI

- **Content Studio** → tab **Images** (`ImageIntelligencePanel`)
- **Mission Control** → Image Intelligence widget
- Links to existing Media Studio / Video Studio unchanged

## Storage

Bucket intent: `image-intelligence`  
Paths: `projects/{workspaceId}/blog/images/{generated|approved|rejected|submission}/`

Create the bucket in Supabase Storage if uploads should persist beyond DB metadata.

## Enable for production

1. Apply migrations `061`–`071` (`npm run db:push`).
2. Set `IMAGE_FLUX_URL` (or `IMAGE_SDXL_URL`) to a self-hosted / free gateway.
3. Create Storage bucket `image-intelligence`.
4. Set feature flag `v13_image_generation=true` (env / org flags overlay).
5. Generate from Content Studio → Images; approve; prepare submission; verify via existing Verification Engine.

## Non-negotiables

- Provider registry only — no hardcoded vendor in UI.
- Default free path: FLUX → SDXL fallback; no paid API required.
- Quality Engine must pass before Ready.
- Every image gets SEO metadata and becomes an Asset Library / `image_assets` row.
- Estimated metrics labeled where probabilistic.
