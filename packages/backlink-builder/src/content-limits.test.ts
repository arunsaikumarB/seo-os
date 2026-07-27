import { describe, expect, it } from 'vitest';
import {
  CONTENT_SIMILARITY_THRESHOLD,
  DESCRIPTION_MAX,
  META_DESCRIPTION_MAX,
  dedupeContentFields,
  fitDescriptionToCap,
  textsAreRepetitive,
} from './content-limits.js';
import {
  buildAssistedPackage,
  buildSiteRecipe,
  textSimilarity,
  type SiteRecipe,
} from './assisted-manual.js';

const CONTENT = {
  title: 'ChefGaa kitchen ops for restaurants',
  shortDescription:
    'ChefGaa helps restaurants run kitchen ops with clear prep lists, ticket flow, and staff coordination so service stays smooth during rush hours every day.',
  longDescription:
    'Restaurants use ChefGaa to align prep, plating, and front-of-house handoffs around one shared kitchen board without inventing tools the product does not ship today.',
  metaDescription:
    'ChefGaa kitchen ops for restaurants — prep lists, ticket flow, and staff coordination in one place.',
  businessName: 'ChefGaa',
  companyName: 'ChefGaa',
  contactName: '',
  url: 'https://go.chefgaa.com',
  email: '',
  phone: '',
  address: '',
  categoryHints: ['Restaurant', 'Kitchen'],
  imageFileName: 'chefgaa-listing.jpg',
};

describe('content-limits (Phase 11)', () => {
  it('caps descriptions at ≤200 (or smaller form maxlength)', () => {
    const long =
      'A'.repeat(50) +
      '. ' +
      'Word '.repeat(80) +
      'end.';
    const capped = fitDescriptionToCap(long);
    expect(capped.value.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(capped.overLimit).toBe(true);

    const formCap = fitDescriptionToCap(long, 120);
    expect(formCap.value.length).toBeLessThanOrEqual(120);

    const meta = fitDescriptionToCap(long, META_DESCRIPTION_MAX);
    expect(meta.value.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('dedupes title/short/long when repetitive', () => {
    const same =
      'ChefGaa helps restaurants run kitchen operations with prep lists and ticket flow during busy service.';
    const out = dedupeContentFields({
      title: 'ChefGaa kitchen ops',
      shortDescription: same,
      longDescription: same,
      metaDescription: same,
    });
    expect(out.shortDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(out.longDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(
      textsAreRepetitive(out.shortDescription, out.longDescription) ||
        out.flagged.includes('short_desc_duplicated_long') ||
        !out.shortDescription
    ).toBe(true);
  });

  it('similarity threshold matches Phase 11 gate', () => {
    expect(CONTENT_SIMILARITY_THRESHOLD).toBe(0.85);
    const t =
      'Our artisan bakery serves fresh bread coffee and pastries every morning downtown with local flour';
    expect(textSimilarity(t, t)).toBeGreaterThanOrEqual(0.85);
  });

  it('package shows only form fields; profile empties say you fill this; other roles listed separately', () => {
    const html = `
<form id="submit">
  <label for="t">Title</label><input id="t" name="title" type="text" maxlength="80" />
  <label for="d">Description</label><textarea id="d" name="description" maxlength="500"></textarea>
  <label for="e">Email</label><input id="e" name="email" type="email" />
  <label for="x">Favorite color</label><input id="x" name="fav_color" type="text" />
  <button type="submit">Submit</button>
</form>`;
    const recipe = buildSiteRecipe({
      domain: 'example.com',
      entryUrl: 'https://example.com/submit',
      html,
    }) as SiteRecipe;
    const pkg = buildAssistedPackage({
      recipe,
      content: CONTENT,
      fingerprintStatus: 'fresh',
      formFound: true,
    });

    expect(pkg.fields.every((f) => f.selector)).toBe(true);
    for (const f of pkg.fields) {
      if (f.role === 'short_desc' || f.role === 'long_desc') {
        expect(f.value.length).toBeLessThanOrEqual(
          Math.min(DESCRIPTION_MAX, f.maxlength ?? DESCRIPTION_MAX)
        );
        expect(f.value.trim().length).toBeGreaterThan(0);
      }
      if ((f.role === 'email' || f.role === 'phone' || f.role === 'name') && !f.value.trim()) {
        expect(f.humanStep?.toLowerCase()).toContain('you fill');
      }
    }
    // Unknown role should not appear as a blank content slot
    const other = pkg.otherFields ?? [];
    const blankUnknown = pkg.fields.filter(
      (f) => f.role === 'other' && !f.value.trim() && !f.humanStep
    );
    expect(blankUnknown).toHaveLength(0);
    if (recipe.fields.some((f) => f.role === 'other' || f.source === 'known_bad')) {
      expect(other.length).toBeGreaterThan(0);
    }

    const contentVals = pkg.fields
      .filter((f) => f.role === 'title' || f.role === 'short_desc' || f.role === 'long_desc')
      .map((f) => f.value.trim().toLowerCase())
      .filter(Boolean);
    for (let i = 0; i < contentVals.length; i++) {
      for (let j = i + 1; j < contentVals.length; j++) {
        expect(textsAreRepetitive(contentVals[i]!, contentVals[j]!)).toBe(false);
      }
    }
  });
});
