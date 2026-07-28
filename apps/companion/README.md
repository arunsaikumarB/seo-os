# SEO OS Companion — Phase 2.3 (Intelligent Field Mapping)

Deterministic field mapper. **No LLM. No auto-submit. One active package in memory.**

## Flow

1. Assisted Manual → **Activate Package** (package + learning credentials in memory)
2. **Open website** → Companion loads domain knowledge from SEO OS
3. Mapping priority: Domain Knowledge → Aliases → Confidence ≥80% → Skip
4. **Fill Current Step** / **Teach Companion** (corrections → `POST /v1/learning/field-mapping`)
5. Shared knowledge improves every future visit for the whole org

## Install

```bash
cd apps/companion && npm run build
```

Load unpacked → `apps/companion/dist`

## Confidence colors

| Color | Meaning |
|-------|---------|
| Green | Verified domain mapping |
| Blue | Global alias |
| Yellow | Confidence match |
| Gray | Skipped |
| Red | Unknown |
