import { describe, expect, it } from 'vitest';
import {
  applyHumanFieldCorrection,
  assignAssistedBucket,
  buildAssistedPackage,
  buildSiteRecipe,
  computeAssistedLaneCounts,
  computeFormFingerprint,
  evaluateFingerprintStatus,
  extractFormFieldFacts,
  findSimilarPackagePairs,
  fitValueToLimit,
  inferFieldRole,
  textSimilarity,
} from './assisted-manual.js';

const SIMPLE_FORM = `
<form>
  <label for="biz">Business Name</label>
  <input id="biz" name="business_name" type="text" required maxlength="80" />
  <label for="desc">Description</label>
  <textarea id="desc" name="description" required maxlength="250"></textarea>
  <label for="cat">Category</label>
  <select id="cat" name="category" required>
    <option value="">Select</option>
    <option>Food & Beverage</option>
    <option>Technology</option>
    <option>Health</option>
  </select>
  <label for="logo">Logo</label>
  <input id="logo" name="logo" type="file" accept=".jpg,.png" />
  <label><input type="checkbox" name="terms" required /> I agree to terms</label>
</form>
`;

const MULTI_STEP = `
<div class="wizard" data-step="1">Step 1 of 3</div>
<form>
  <input name="title" id="title" />
  <button type="button">Next</button>
</form>
`;

const LOW_CONF = `
<form>
  <input name="desc2" type="text" />
</form>
`;

describe('Phase 7 Assisted Manual', () => {
  it('extracts maxlength and produces description ≤ 250 (AT1)', () => {
    const facts = extractFormFieldFacts(SIMPLE_FORM);
    const desc = facts.find((f) => f.id === 'desc');
    expect(desc?.maxlength).toBe(250);
    const long = 'A'.repeat(300);
    const fitted = fitValueToLimit(long, 250);
    expect(fitted.value.length).toBeLessThanOrEqual(250);
  });

  it('shows real dropdown options with one recommended (AT2)', () => {
    const recipe = buildSiteRecipe({
      domain: 'example.com',
      entryUrl: 'https://example.com/submit',
      html: SIMPLE_FORM,
    });
    const pkg = buildAssistedPackage({
      recipe,
      content: {
        businessName: 'Chef Gaa',
        longDescription: 'A cozy restaurant.',
        categoryHints: ['Food'],
        imageFileName: 'chefgaa-somuch-listing.jpg',
      },
    });
    const cat = pkg.fields.find((f) => f.role === 'category');
    expect(cat?.options).toEqual(['Food & Beverage', 'Technology', 'Health']);
    expect(cat?.recommendedOption).toBe('Food & Beverage');
    expect(cat?.options).not.toContain('Invented Category');
  });

  it('scores explicit label high and name=desc2 low (AT3)', () => {
    const labeled = extractFormFieldFacts(SIMPLE_FORM).find((f) => f.id === 'biz')!;
    const high = inferFieldRole(labeled);
    expect(high.confidence).toBe('high');
    expect(high.source).toBe('dom_label');

    const guess = extractFormFieldFacts(LOW_CONF)[0]!;
    const low = inferFieldRole(guess);
    expect(low.confidence).toBe('low');
  });

  it('routes multi-step to Needs a person (AT4)', () => {
    const recipe = buildSiteRecipe({
      domain: 'wizard.example',
      entryUrl: 'https://wizard.example/add',
      html: MULTI_STEP,
    });
    expect(recipe.multiStep).toBe(true);
    const pkg = buildAssistedPackage({
      recipe,
      content: { title: 'x', longDescription: 'y' },
    });
    expect(pkg.bucket).toBe('needs_person');
    expect(pkg.multiStepLabel).toMatch(/Multi-step/);
  });

  it('marks fingerprint change as re-prepare (AT5)', () => {
    const a = extractFormFieldFacts(SIMPLE_FORM);
    const fp1 = computeFormFingerprint(a);
    const b = extractFormFieldFacts(SIMPLE_FORM + '<input name="extra" id="extra" />');
    const fp2 = computeFormFingerprint(b);
    expect(fp1).not.toBe(fp2);
    const status = evaluateFingerprintStatus({
      preparedAt: new Date().toISOString(),
      storedFingerprint: fp1,
      liveFingerprint: fp2,
    });
    expect(status).toBe('changed');
    const bucket = assignAssistedBucket({
      recipe: buildSiteRecipe({
        domain: 'x.com',
        entryUrl: 'https://x.com',
        html: SIMPLE_FORM,
      }),
      fields: [],
      fingerprintStatus: 'changed',
      formFound: true,
    });
    expect(bucket).toBe('needs_person');
  });

  it('detects >0.85 similarity pairs (AT6)', () => {
    const text =
      'Our artisan bakery serves fresh bread coffee and pastries every morning downtown';
    const pairs = findSimilarPackagePairs([
      { id: 'a', text },
      { id: 'b', text },
      { id: 'c', text: 'Completely different industrial machinery catalog content here' },
    ]);
    expect(pairs.some((p) => p.a === 'a' && p.b === 'b')).toBe(true);
    expect(textSimilarity(text, text)).toBeGreaterThan(0.85);
  });

  it('stores human correction and never re-guesses (AT7)', () => {
    const recipe = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
    });
    const sel = recipe.fields[0]!.selector;
    const corrected = applyHumanFieldCorrection(recipe, {
      selector: sel,
      role: 'long_desc',
    });
    expect(corrected.fields[0]!.source).toBe('human_corrected');
    expect(corrected.fields[0]!.confidence).toBe('high');
    expect(corrected.correctionCount).toBe(1);

    const rebuilt = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
      existing: corrected,
    });
    expect(rebuilt.fields[0]!.source).toBe('human_corrected');
    expect(rebuilt.fields[0]!.role).toBe('long_desc');
  });

  it('conservation: automatable + assisted + manual === active (AT10)', () => {
    const counts = computeAssistedLaneCounts({
      automatable: 4,
      manualTotal: 6,
      assistedPackages: [
        { bucket: 'ready' },
        { bucket: 'ready' },
        { bucket: 'check_fields' },
      ],
    });
    expect(counts.assisted).toBe(3);
    expect(counts.manual).toBe(3);
    expect(counts.conservationOk).toBe(true);
    expect(counts.assistedOk).toBe(true);
    expect(counts.ready).toBe(2);
  });

  it('TTL marks stale regardless of fingerprint', () => {
    const status = evaluateFingerprintStatus({
      preparedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      storedFingerprint: 'fp_abc',
      liveFingerprint: 'fp_abc',
      ttlDays: 7,
    });
    expect(status).toBe('stale');
  });
});
