import { describe, expect, it } from 'vitest';
import {
  applyHumanFieldCorrection,
  markFieldMappingWrong,
  clearHumanCorrections,
  assignAssistedBucket,
  buildAssistedPackage,
  buildSiteRecipe,
  computeAssistedLaneCounts,
  computeFormFingerprint,
  detectGateFromHtml,
  detectMultiStepForm,
  evaluateFingerprintStatus,
  extractFormFieldFacts,
  fieldFactSnapshot,
  findSimilarPackagePairs,
  fitValueToLimit,
  gateBlocksReady,
  gateIsOtp,
  gateRequiresPerson,
  inferFieldRole,
  leadingAttrToken,
  recipeVersionsCurrent,
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

  it('omits category fields entirely and notes to pick on the site', () => {
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
    expect(pkg.fields.some((f) => f.role === 'category')).toBe(false);
    expect(pkg.otherFields?.some((o) => /categor/i.test(o.label))).toBeFalsy();
    expect(pkg.categoryNote).toBe('Pick the category yourself on the site');
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

  it('filters search/nav inputs out of Form Reader', () => {
    const html = `
<form>
  <label for="site">Website URL</label>
  <input id="site" name="website" type="url" required />
  <input type="search" name="q" placeholder="Search this site" />
  <input name="search" id="nav-search" aria-label="Search" type="text" />
</form>`;
    const facts = extractFormFieldFacts(html);
    expect(facts.some((f) => f.type === 'search' || f.name === 'q' || f.name === 'search')).toBe(
      false
    );
    expect(facts.find((f) => f.id === 'site')).toBeTruthy();
  });

  it('demotes empty mapped values to low confidence', () => {
    const recipe = buildSiteRecipe({
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      html: `
<form>
  <label for="url">Website URL</label>
  <input id="url" name="website_url" type="url" required />
  <label for="title">Title</label>
  <input id="title" name="title" type="text" required />
</form>`,
    });
    const empty = buildAssistedPackage({
      recipe,
      content: { url: '', title: '', businessName: '' },
    });
    for (const f of empty.fields.filter((x) => x.role === 'url' || x.role === 'title')) {
      expect(f.confidence).toBe('low');
      expect(f.value).toBe('');
    }
    const filled = buildAssistedPackage({
      recipe,
      content: {
        url: 'https://go.chefgaa.com',
        title: 'Chef Gaa',
        businessName: 'Chef Gaa',
        shortDescription: 'Restaurant',
      },
    });
    const url = filled.fields.find((f) => f.role === 'url');
    expect(url?.value).toBe('https://go.chefgaa.com');
    expect(url?.confidence).toBe('high');
  });

  it('does not classify Search this site as url', () => {
    const role = inferFieldRole({
      label: 'Search this site',
      name: 'q',
      id: 'search',
      placeholder: 'Search…',
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: null,
      options: [],
      surroundingText: 'nav search',
      accept: null,
      sizeHint: null,
      selector: '#search',
    });
    expect(role.role).toBe('other');
    expect(role.confidence).toBe('low');
  });

  it('weights leading label token over helper text mentioning website', () => {
    const title = inferFieldRole({
      label: 'Title (Optional) Leave blank to auto-fetch from website',
      name: 'title',
      id: 'title',
      placeholder: null,
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: 80,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#title',
    });
    expect(title.role).toBe('title');

    const desc = inferFieldRole({
      label: 'Description (Optional) Leave blank to auto-fetch from website',
      name: 'description',
      id: 'description',
      placeholder: null,
      ariaLabel: null,
      type: 'textarea',
      required: false,
      maxlength: 500,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#description',
    });
    expect(desc.role).toBe('long_desc');

    const website = inferFieldRole({
      label: 'Website URL',
      name: 'website',
      id: 'website',
      placeholder: null,
      ariaLabel: null,
      type: 'url',
      required: true,
      maxlength: null,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#website',
    });
    expect(website.role).toBe('url');

    const longNeverUrl = inferFieldRole({
      label: 'Website notes',
      name: 'notes',
      id: 'notes',
      placeholder: null,
      ariaLabel: null,
      type: 'textarea',
      required: false,
      maxlength: 400,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#notes',
    });
    expect(longNeverUrl.role).not.toBe('url');
  });

  it('literal viesearch labels: Title…website → title; Description…website → description', () => {
    expect(
      inferFieldRole({
        label: 'Title (Optional) Leave blank to auto-fetch from website',
        name: null,
        id: null,
        placeholder: null,
        ariaLabel: null,
        type: 'text',
        required: false,
        maxlength: null,
        options: [],
        surroundingText: null,
        accept: null,
        sizeHint: null,
        selector: 'input',
      }).role
    ).toBe('title');

    expect(
      inferFieldRole({
        label: 'Description (Optional) Leave blank to auto-fetch from website',
        name: null,
        id: null,
        placeholder: null,
        ariaLabel: null,
        type: 'textarea',
        required: false,
        maxlength: null,
        options: [],
        surroundingText: null,
        accept: null,
        sizeHint: null,
        selector: 'textarea',
      }).role
    ).toBe('long_desc');
  });

  it('explicit label outranks name/id even when attrs look like url', () => {
    const titleOverUrlName = inferFieldRole({
      label: 'Title (Optional) Leave blank to auto-fetch from website',
      name: 'url',
      id: 'website_url',
      placeholder: 'https://example.com',
      ariaLabel: null,
      type: 'url',
      required: false,
      maxlength: null,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#website_url',
    });
    expect(titleOverUrlName.role).toBe('title');
    expect(titleOverUrlName.source).toBe('dom_label');

    const descOverUrlName = inferFieldRole({
      label: 'Description (Optional) Leave blank to auto-fetch from website',
      name: 'url',
      id: 'url',
      placeholder: null,
      ariaLabel: null,
      type: 'textarea',
      required: false,
      maxlength: 400,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#url',
    });
    expect(descOverUrlName.role).toBe('long_desc');
  });

  it('attribute names get Optional-stripping / leading-token when no label', () => {
    expect(leadingAttrToken('listing_title')).toBe('listing');
    expect(leadingAttrToken('website_url')).toBe('website');
    expect(
      inferFieldRole({
        label: null,
        name: 'title',
        id: 'title',
        placeholder: null,
        ariaLabel: null,
        type: 'text',
        required: false,
        maxlength: null,
        options: [],
        surroundingText: '',
        accept: null,
        sizeHint: null,
        selector: '#title',
      }).role
    ).toBe('title');
    expect(
      inferFieldRole({
        label: null,
        name: 'website_url',
        id: null,
        placeholder: null,
        ariaLabel: null,
        type: 'text',
        required: false,
        maxlength: null,
        options: [],
        surroundingText: '',
        accept: null,
        sizeHint: null,
        selector: '[name=website_url]',
      }).role
    ).toBe('url');
  });

  it('fieldFactSnapshot matches unit-test viesearch shape', () => {
    const snap = fieldFactSnapshot({
      label: 'Title (Optional) Leave blank to auto-fetch from website',
      name: 'title',
      id: 'title',
      placeholder: 'Custom title for your listing',
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: null,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#title',
    });
    expect(snap).toMatchObject({
      name: 'title',
      id: 'title',
      type: 'text',
      labelText: 'Title (Optional) Leave blank to auto-fetch from website',
      leadingFromLabel: 'title',
      role: 'title',
    });
  });

  it('reclassifies when recipe reader/classifier version is stale', () => {
    const html = `
<form>
  <label for="title">Title (Optional) Leave blank to auto-fetch from website</label>
  <input id="title" name="title" type="text" />
  <label for="website">Website URL</label>
  <input id="website" name="website" type="url" />
</form>`;
    const stale = {
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      formFingerprint: 'fp_stale',
      fields: [
        {
          selector: '#title',
          role: 'url' as const,
          confidence: 'high' as const,
          source: 'dom_label' as const,
          label: 'Title (Optional) Leave blank to auto-fetch from website',
          required: false,
          maxlength: null,
        },
      ],
      dropdownOptions: {},
      gate: 'none' as const,
      notes: '',
      lastVerifiedAt: null,
      correctionCount: 0,
      multiStep: false,
      readerVersion: 1,
      classifierVersion: 1,
    };
    const next = buildSiteRecipe({
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      html,
      existing: stale,
      forceReclassify: true,
    });
    expect(recipeVersionsCurrent(next)).toBe(true);
    expect(next.fields.find((f) => f.selector === '#title')?.role).toBe('title');
    expect(next.fields.find((f) => f.selector === '#website')?.role).toBe('url');
  });

  it('attaches paste-ready content even when form not found (Needs a person)', () => {
    const recipe = buildSiteRecipe({
      domain: 'empty.example',
      entryUrl: 'https://empty.example/',
      html: '<html><body><p>No form</p></body></html>',
    });
    const pkg = buildAssistedPackage({
      recipe,
      content: {
        title: 'Chefgaa POS',
        shortDescription: 'Restaurant POS',
        longDescription: 'Chefgaa helps restaurants run checkout.',
        url: 'https://chefgaa.com',
        businessName: 'Chefgaa',
      },
      formFound: false,
    });
    expect(pkg.bucket).toBe('needs_person');
    expect(pkg.formUnavailable).toBeFalsy();
    expect(pkg.pasteReadyContent?.map((c) => c.role)).toEqual(
      expect.arrayContaining(['title', 'long_desc', 'url'])
    );
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
      content: {
        title: 'Chefgaa POS',
        shortDescription: 'Restaurant point of sale',
        longDescription: 'Chefgaa helps restaurants run checkout.',
        url: 'https://chefgaa.com',
        businessName: 'Chefgaa',
      },
    });
    expect(pkg.bucket).toBe('needs_person');
    expect(pkg.multiStepLabel).toMatch(/content ready|content prepared/i);
    // Title is on step 1 — paste-ready holds the unmapped listing copy
    expect(pkg.fields.some((f) => f.role === 'title')).toBe(true);
    expect(pkg.pasteReadyContent?.some((c) => c.role === 'long_desc')).toBe(true);
    expect(pkg.pasteReadyContent?.some((c) => c.role === 'url')).toBe(true);
  });

  it('detects tagshub-style Step One / Go To Step Two and attaches paste-ready content', () => {
    const html = `
      <h1>Step One: Choose a Category</h1>
      <form>
        <select name="category" id="cat" required>
          <option value="">Select</option>
          <option>Business & Economy</option>
          <option>Computers & Internet</option>
        </select>
        <input type="submit" value="Go To Step Two" />
      </form>
    `;
    expect(detectMultiStepForm(html)).toBe(true);
    const recipe = buildSiteRecipe({
      domain: 'tagshub.com',
      entryUrl: 'https://tagshub.com/submit',
      html,
    });
    expect(recipe.multiStep).toBe(true);
    const pkg = buildAssistedPackage({
      recipe,
      content: {
        title: 'Chefgaa',
        longDescription: 'Restaurant POS software',
        url: 'https://chefgaa.com',
        categoryHints: ['Business', 'Software', 'POS'],
      },
    });
    expect(pkg.bucket).toBe('needs_person');
    expect(pkg.multiStepLabel).toBe(
      'Multi-step — content ready, paste on the later step'
    );
    expect(pkg.fields.some((f) => f.role === 'category')).toBe(false);
    expect(pkg.categoryNote).toBe('Pick the category yourself on the site');
    expect(pkg.fields.some((f) => f.role === 'title')).toBe(false);
    expect(pkg.pasteReadyContent?.map((c) => c.role)).toEqual(
      expect.arrayContaining(['title', 'long_desc', 'url'])
    );
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

  it('hard gates → needs_person; otp_* → check_fields; none can be Ready', () => {
    const baseRecipe = buildSiteRecipe({
      domain: 'forum.parallels.com',
      entryUrl: 'https://forum.parallels.com/submit',
      html: SIMPLE_FORM,
    });
    const highFields = baseRecipe.fields.map((f) => ({
      selector: f.selector,
      label: f.label ?? f.role,
      role: f.role,
      value: 'ok',
      charCount: 2,
      maxlength: f.maxlength,
      confidence: 'high' as const,
      source: f.source,
      required: f.required,
      overLimit: false,
      humanStep: null,
      recommendedOption: null,
      options: f.options,
    }));

    for (const gate of ['login', 'captcha', 'cloudflare', 'registration', 'multi_step'] as const) {
      expect(
        assignAssistedBucket({
          recipe: { ...baseRecipe, gate, multiStep: gate === 'multi_step' },
          fields: highFields,
          fingerprintStatus: 'fresh',
          formFound: true,
        })
      ).toBe('needs_person');
    }

    for (const gate of ['otp_email', 'otp_phone'] as const) {
      expect(
        assignAssistedBucket({
          recipe: { ...baseRecipe, gate },
          fields: highFields,
          fingerprintStatus: 'fresh',
          formFound: true,
        })
      ).toBe('check_fields');
    }

    expect(gateIsOtp('otp_phone')).toBe(true);
    expect(gateRequiresPerson('otp_phone')).toBe(false);
    expect(gateBlocksReady('otp_phone')).toBe(true);
    expect(gateRequiresPerson('login')).toBe(true);

    const noneBucket = assignAssistedBucket({
      recipe: { ...baseRecipe, gate: 'none' },
      fields: highFields,
      fingerprintStatus: 'fresh',
      formFound: true,
    });
    expect(noneBucket).not.toBe('needs_person');
  });

  it('detectGateFromHtml maps login/captcha/cloudflare/registration', () => {
    expect(detectGateFromHtml('<form><input type="password"/><button>Log in</button></form>')).toBe(
      'login'
    );
    expect(detectGateFromHtml('<div class="g-recaptcha"></div><form></form>')).toBe('captcha');
    expect(detectGateFromHtml('<div>Checking your browser — Cloudflare</div>')).toBe('cloudflare');
    expect(
      detectGateFromHtml('<form><input type="password"/><button>Create account</button></form>')
    ).toBe('registration');
    expect(gateBlocksReady('login')).toBe(true);
    expect(gateBlocksReady('none')).toBe(false);
  });

  it('detects ≥0.80 similarity pairs (Phase 12)', () => {
    const text =
      'Our artisan bakery serves fresh bread coffee and pastries every morning downtown';
    const pairs = findSimilarPackagePairs([
      { id: 'a', text },
      { id: 'b', text },
      { id: 'c', text: 'Completely different industrial machinery catalog content here' },
    ]);
    expect(pairs.some((p) => p.a === 'a' && p.b === 'b')).toBe(true);
    expect(textSimilarity(text, text)).toBeGreaterThanOrEqual(0.8);
  });

  it('stores human correction and never re-guesses when it agrees (AT7)', () => {
    const recipe = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
    });
    const sel = recipe.fields[0]!.selector;
    const corrected = applyHumanFieldCorrection(recipe, {
      selector: sel,
      role: recipe.fields[0]!.role,
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
    expect(rebuilt.fields[0]!.role).toBe(recipe.fields[0]!.role);
  });

  it('drops human_corrected pin that contradicts high-confidence dom_label', () => {
    const html = `
<form>
  <label for="title">Title (Optional) Leave blank to auto-fetch from website</label>
  <input id="title" name="title" type="text" />
</form>`;
    const pinned = {
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      formFingerprint: 'fp_x',
      fields: [
        {
          selector: '#title',
          role: 'url' as const,
          confidence: 'high' as const,
          source: 'human_corrected' as const,
          label: 'Title',
          required: false,
          maxlength: null,
        },
      ],
      dropdownOptions: {},
      gate: 'none' as const,
      notes: '',
      lastVerifiedAt: null,
      correctionCount: 1,
      multiStep: false,
      readerVersion: 3,
      classifierVersion: 5,
    };
    const next = buildSiteRecipe({
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      html,
      existing: pinned,
      forceReclassify: true,
    });
    const title = next.fields.find((f) => f.selector === '#title')!;
    expect(title.role).toBe('title');
    expect(title.source).toBe('dom_label');
  });

  it('dropHumanPins ignores all human_corrected entries', () => {
    const html = `
<form>
  <label for="title">Title (Optional) Leave blank to auto-fetch from website</label>
  <input id="title" name="title" type="text" />
</form>`;
    const pinned = {
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      formFingerprint: 'fp_x',
      fields: [
        {
          selector: '#title',
          role: 'url' as const,
          confidence: 'high' as const,
          source: 'human_corrected' as const,
          label: 'Title',
          required: false,
          maxlength: null,
        },
      ],
      dropdownOptions: {},
      gate: 'none' as const,
      notes: '',
      lastVerifiedAt: null,
      correctionCount: 3,
      multiStep: false,
    };
    const next = buildSiteRecipe({
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      html,
      existing: pinned,
      forceReclassify: true,
      dropHumanPins: true,
    });
    expect(next.fields.find((f) => f.selector === '#title')?.role).toBe('title');
    expect(next.fields.find((f) => f.selector === '#title')?.source).not.toBe('human_corrected');
    expect(next.correctionCount).toBe(0);
  });

  it('mark wrong is known_bad and re-infers on next read (does not pin)', () => {
    const recipe = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
    });
    const sel = recipe.fields[0]!.selector;
    const marked = markFieldMappingWrong(recipe, sel);
    expect(marked.fields[0]!.source).toBe('known_bad');
    expect(marked.fields[0]!.confidence).toBe('low');
    expect(marked.fields[0]!.role).toBe('other');
    expect(marked.fields[0]!.source).not.toBe('human_corrected');

    const rebuilt = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
      existing: marked,
      forceReclassify: true,
    });
    const field = rebuilt.fields.find((f) => f.selector === sel)!;
    expect(field.source).not.toBe('known_bad');
    expect(field.source).not.toBe('human_corrected');
  });

  it('clearHumanCorrections strips pins so rebuild can re-guess', () => {
    const recipe = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
    });
    const sel = recipe.fields[0]!.selector;
    const corrected = applyHumanFieldCorrection(recipe, {
      selector: sel,
      role: 'phone',
    });
    expect(corrected.fields[0]!.source).toBe('human_corrected');
    expect(corrected.fields[0]!.role).toBe('phone');
    const cleared = clearHumanCorrections(corrected);
    expect(cleared.fields[0]!.source).not.toBe('human_corrected');
    expect(cleared.fields[0]!.source).not.toBe('known_bad');
    expect(cleared.correctionCount).toBe(0);
    const rebuilt = buildSiteRecipe({
      domain: 'justdial.com',
      entryUrl: 'https://justdial.com/add',
      html: LOW_CONF,
      existing: cleared,
      forceReclassify: true,
      dropHumanPins: true,
    });
    expect(rebuilt.fields[0]!.source).not.toBe('human_corrected');
    expect(rebuilt.fields[0]!.role === 'phone' && rebuilt.fields[0]!.source === 'human_corrected').toBe(
      false
    );
  });

  it('conservation: automatable + manualTotal === active; packages bucket-sum OK', () => {
    const counts = computeAssistedLaneCounts({
      automatable: 4,
      manualTotal: 6,
      assistedPackages: [
        { bucket: 'ready' },
        { bucket: 'ready' },
        { bucket: 'check_fields' },
        { bucket: 'ready' },
        { bucket: 'ready' },
      ],
      manualWithPackage: 2,
    });
    expect(counts.assisted).toBe(5);
    expect(counts.manual).toBe(4); // 6 manual - 2 with packages
    expect(counts.manualTotal).toBe(6);
    expect(counts.conservationOk).toBe(true);
    expect(counts.assistedOk).toBe(true);
    expect(counts.ready).toBe(4);
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
