-- 100_purge_legacy_assisted_human_pins.sql
-- Purge stuck human_corrected / known_bad pins written by the pre-known_bad
-- "Mark field wrong" path (pinned role=url without a user-chosen replacement).
-- Next Assisted Manual re-read re-infers from the live form.

-- site_profiles.recipe.fields: demote pin sources so merge will not preserve them
UPDATE public.site_profiles
SET
  recipe = jsonb_set(
    jsonb_set(
      jsonb_set(
        recipe,
        '{fields}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN elem->>'source' IN ('human_corrected', 'known_bad')
                THEN (elem - 'source' - 'confidence')
                  || jsonb_build_object('source', 'name_guess', 'confidence', 'low')
                ELSE elem
              END
            )
            FROM jsonb_array_elements(COALESCE(recipe->'fields', '[]'::jsonb)) AS elem
          ),
          '[]'::jsonb
        )
      ),
      '{classifierVersion}',
      '0'::jsonb
    ),
    '{readerVersion}',
    '0'::jsonb
  ),
  updated_at = now()
WHERE recipe ? 'fields'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(recipe->'fields', '[]'::jsonb)) AS e
    WHERE e->>'source' IN ('human_corrected', 'known_bad')
  );

-- assisted_packages.payload.fields: same demotion so UI stops showing pinned url
UPDATE public.assisted_packages
SET
  payload = jsonb_set(
    jsonb_set(
      jsonb_set(
        payload,
        '{fields}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN elem->>'source' IN ('human_corrected', 'known_bad')
                THEN (elem - 'source' - 'confidence')
                  || jsonb_build_object('source', 'name_guess', 'confidence', 'low')
                ELSE elem
              END
            )
            FROM jsonb_array_elements(COALESCE(payload->'fields', '[]'::jsonb)) AS elem
          ),
          '[]'::jsonb
        )
      ),
      '{classifierVersion}',
      '0'::jsonb
    ),
    '{readerVersion}',
    '0'::jsonb
  ),
  correction_count = 0,
  failure_reason = COALESCE(
    NULLIF(failure_reason, ''),
    'Legacy human pins purged — re-read form to refresh roles'
  ),
  updated_at = now()
WHERE payload ? 'fields'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(payload->'fields', '[]'::jsonb)) AS e
    WHERE e->>'source' IN ('human_corrected', 'known_bad')
  );
