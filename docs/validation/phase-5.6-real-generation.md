# Phase 5.6 Hotfix — Real Content Generation

**Date:** 2026-07-23

## Root cause
`createContentPack` called `generateContentPack` (deterministic templates) and never the LLM router. `brandFor()` required `orgId`, which the campaign path never passed → always **"Our Brand"** / **example.com**. Quality ~79 was a heuristic that scored templates identically.

## Fixes
1. LLM generation via `getAIRuntime().providers.getAIProviderRouter().completeWithFailover` + PIF `recordProviderInvocation` (Today's calls).
2. Brand loaded from workspace by id (name/domain/url).
3. Template path only when `GENERATION_MOCK=true` (throws otherwise).
4. Placeholder tripwire (`Our Brand`, `Insight 1`, `example.com`, …).
5. Honest image status when provider unavailable.
6. Migration `094` invalidates existing template packs → Approved + regeneration required.

## Acceptance
- Generate Chefgaa packages → provider calls increase; content mentions Chefgaa; no template markers; scores vary.
