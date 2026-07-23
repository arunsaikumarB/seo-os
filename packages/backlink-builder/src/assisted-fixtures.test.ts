/**
 * Phase 8 — fixture regression suite.
 * Loads HTML + expected.json under fixtures/assisted-manual/.
 * Every future bug adds a fixture; CI runs this on every deploy.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assignAssistedBucket,
  buildAssistedPackage,
  buildSiteRecipe,
  inferFieldRole,
  extractFormFieldFacts,
} from './assisted-manual.js';
import {
  confidenceAfterSelfCheck,
  valueMatchesRole,
} from './assisted-self-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, '../fixtures/assisted-manual');

type ExpectedField = {
  match: { id?: string; name?: string; labelIncludes?: string };
  role: string;
  roleAllow?: string[];
  mustNotBeRole?: string[];
};

type ExpectedFixture = {
  id: string;
  domain: string;
  entryUrl: string;
  gate: string;
  gateAllow?: string[];
  bucket?: string;
  bucketAllow?: string[];
  fields: ExpectedField[];
  notes?: string;
};

function loadFixture(id: string): { html: string; expected: ExpectedFixture } {
  const dir = join(FIXTURE_ROOT, id);
  const html = readFileSync(join(dir, 'page.html'), 'utf8');
  const expected = JSON.parse(
    readFileSync(join(dir, 'expected.json'), 'utf8')
  ) as ExpectedFixture;
  return { html, expected };
}

function findRecipeField(
  recipe: ReturnType<typeof buildSiteRecipe>,
  match: ExpectedField['match']
) {
  return recipe.fields.find((f) => {
    if (match.id) {
      const sel = f.selector.replace(/\[.*$/, '').trim();
      if (sel === `#${match.id}` || sel === match.id) return true;
      // name= match sometimes surfaces as [name="x"]
      if (f.selector.includes(`#${match.id}`)) return true;
    }
    if (match.name && f.selector.includes(`name="${match.name}"`)) return true;
    if (
      match.labelIncludes &&
      (f.label ?? '').toLowerCase().includes(match.labelIncludes.toLowerCase())
    ) {
      return true;
    }
    return false;
  });
}

const SAMPLE_CONTENT = {
  title: 'Chefgaa Artisan Bakery',
  businessName: 'Chefgaa',
  shortDescription: 'Fresh bread and coffee downtown every morning for locals.',
  longDescription:
    'Chefgaa is an artisan bakery serving fresh bread, coffee, and pastries every morning. Visit us downtown for sourdough, croissants, and seasonal specials.',
  url: 'https://go.chefgaa.com',
  email: 'hello@chefgaa.com',
  phone: '+1 555 0100',
  address: '100 Main St',
  categoryHints: ['Food & Beverage'],
};

describe('Phase 8 Assisted Manual fixtures', () => {
  const manifest = JSON.parse(
    readFileSync(join(FIXTURE_ROOT, 'manifest.json'), 'utf8')
  ) as { fixtures: string[] };

  it('manifest lists every on-disk fixture folder', () => {
    const dirs = readdirSync(FIXTURE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...manifest.fixtures].sort()).toEqual(dirs);
    for (const id of dirs) {
      expect(existsSync(join(FIXTURE_ROOT, id, 'page.html'))).toBe(true);
      expect(existsSync(join(FIXTURE_ROOT, id, 'expected.json'))).toBe(true);
    }
  });

  for (const id of manifest.fixtures) {
    it(`fixture ${id}: roles, gate, bucket`, () => {
      const { html, expected } = loadFixture(id);
      const recipe = buildSiteRecipe({
        domain: expected.domain,
        entryUrl: expected.entryUrl,
        html,
      });

      const allowedGates = expected.gateAllow ?? [expected.gate];
      expect(allowedGates).toContain(recipe.gate);

      for (const spec of expected.fields) {
        const field = findRecipeField(recipe, spec.match);
        expect(field, `missing field for ${JSON.stringify(spec.match)}`).toBeTruthy();
        if (!field) continue;
        const allowed = spec.roleAllow ?? [spec.role];
        expect(allowed).toContain(field.role);
        for (const bad of spec.mustNotBeRole ?? []) {
          expect(field.role).not.toBe(bad);
        }
      }

      const pkg = buildAssistedPackage({
        recipe,
        content: SAMPLE_CONTENT,
        formFound: true,
      });
      const allowedBuckets = expected.bucketAllow ?? (expected.bucket ? [expected.bucket] : []);
      if (allowedBuckets.length) {
        expect(allowedBuckets).toContain(pkg.bucket);
      }

      // Direct bucket check from recipe (same path as package)
      const bucket = assignAssistedBucket({
        recipe,
        fields: pkg.fields,
        fingerprintStatus: 'fresh',
        formFound: true,
      });
      if (allowedBuckets.length) {
        expect(allowedBuckets).toContain(bucket);
      }
    });
  }
});

describe('Phase 8 self-check + confidence gate', () => {
  it('flags title that is a URL and demotes confidence from high', () => {
    const r = confidenceAfterSelfCheck('title', 'dom_label', 'high', 'https://viesearch.com/submit');
    expect(r.flagged).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.flagReason).toMatch(/must not be a URL/i);
  });

  it('accepts a real URL in a url field as high', () => {
    const r = confidenceAfterSelfCheck('url', 'dom_label', 'high', 'https://go.chefgaa.com');
    expect(r.flagged).toBe(false);
    expect(r.confidence).toBe('high');
  });

  it('rejects url-shaped value that is not a URL', () => {
    expect(valueMatchesRole('url', 'not a link').ok).toBe(false);
  });

  it('flags empty required-like values as low', () => {
    const r = confidenceAfterSelfCheck('title', 'dom_label', 'high', '');
    expect(r.confidence).toBe('low');
    expect(r.flagged).toBe(true);
  });

  it('package never ships title=URL as high (title-shows-a-URL bug)', () => {
    const html = `
<form>
  <label for="title">Title</label>
  <input id="title" name="title" type="text" />
</form>`;
    const recipe = buildSiteRecipe({
      domain: 'x.com',
      entryUrl: 'https://x.com',
      html,
    });
    // Force wrong value through content that somehow became a URL in title role
    const pkg = buildAssistedPackage({
      recipe: {
        ...recipe,
        fields: recipe.fields.map((f) =>
          f.role === 'title' ? { ...f, confidence: 'high', source: 'dom_label' } : f
        ),
      },
      content: {
        ...SAMPLE_CONTENT,
        title: 'https://viesearch.com/submit',
      },
    });
    const title = pkg.fields.find((f) => f.role === 'title');
    expect(title).toBeTruthy();
    expect(title!.confidence).not.toBe('high');
    expect(title!.flagged).toBe(true);
  });

  it('inferFieldRole: viesearch title label is title not url', () => {
    const { html } = loadFixture('viesearch');
    const facts = extractFormFieldFacts(html);
    const titleFact = facts.find((f) => f.id === 'title');
    expect(titleFact).toBeTruthy();
    const inferred = inferFieldRole(titleFact!);
    expect(inferred.role).toBe('title');
  });
});
