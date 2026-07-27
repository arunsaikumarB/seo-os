/**
 * Phase 9 — role-value binding, media skip. Category is never packaged.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAssistedPackage,
  buildSiteRecipe,
  inferFieldRole,
  sanitizeOptionLabel,
  stripCategoryFromAssistedPayload,
  valueForRole,
  type ContentSource,
} from './assisted-manual.js';
import { valueMatchesRole, selfCheckPackageFields } from './assisted-self-check.js';
import { strategyNeedsMedia } from './strategy-media.js';

const CONTENT: ContentSource = {
  title: 'Chefgaa Artisan Tools',
  businessName: 'Chefgaa',
  companyName: 'Chefgaa Inc',
  contactName: 'Arun Kumar',
  shortDescription: 'Smart tools for local bakeries.',
  longDescription:
    'Chefgaa is a bakery operations platform that helps teams manage orders, staffing, and inventory from one place.',
  url: 'https://go.chefgaa.com',
  email: 'hello@chefgaa.com',
  phone: '+1 555 0100',
  categoryHints: ['Business', 'Software', 'Services'],
};

describe('Phase 9 role-value binding', () => {
  it('never fills url/email/name from the description', () => {
    expect(valueForRole('url', CONTENT)).toBe('https://go.chefgaa.com');
    expect(valueForRole('email', CONTENT)).toBe('hello@chefgaa.com');
    expect(valueForRole('name', CONTENT)).toBe('Arun Kumar');
    expect(valueForRole('name', { ...CONTENT, contactName: '' })).toBe('');
    expect(valueForRole('other', CONTENT)).toBe('');
    expect(valueForRole('url', { ...CONTENT, url: '' })).toBe('');
  });

  it('classifies OWNER_NAME / OWNER_EMAIL correctly — not as long_desc', () => {
    const name = inferFieldRole({
      label: 'OWNER_NAME',
      name: 'OWNER_NAME',
      id: 'OWNER_NAME',
      placeholder: null,
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: 255,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#OWNER_NAME',
    });
    expect(name.role).toBe('name');

    const email = inferFieldRole({
      label: 'OWNER_EMAIL',
      name: 'OWNER_EMAIL',
      id: 'OWNER_EMAIL',
      placeholder: null,
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: 255,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#OWNER_EMAIL',
    });
    expect(email.role).toBe('email');
  });

  it('keeps URL role even when maxlength is large', () => {
    const url = inferFieldRole({
      label: 'URL',
      name: 'URL',
      id: 'URL',
      placeholder: null,
      ariaLabel: null,
      type: 'text',
      required: false,
      maxlength: 255,
      options: [],
      surroundingText: '',
      accept: null,
      sizeHint: null,
      selector: '#URL',
    });
    expect(url.role).toBe('url');
  });

  it('unknown long field becomes other (empty), not description dump', () => {
    const recipe = buildSiteRecipe({
      domain: 'ex.com',
      entryUrl: 'https://ex.com/submit',
      html: `
<form>
  <label for="weird">Mystery</label>
  <input id="weird" name="mystery" maxlength="255" />
  <label for="url">URL</label>
  <input id="url" name="url" type="url" />
  <label for="owner">OWNER_NAME</label>
  <input id="owner" name="OWNER_NAME" maxlength="255" />
  <label for="oem">OWNER_EMAIL</label>
  <input id="oem" name="OWNER_EMAIL" maxlength="255" />
  <label for="desc">Description</label>
  <textarea id="desc" name="description"></textarea>
</form>`,
    });
    const pkg = buildAssistedPackage({ recipe, content: CONTENT, formFound: true });
    const url = pkg.fields.find((f) => f.role === 'url');
    const owner = pkg.fields.find((f) => f.role === 'name');
    const oem = pkg.fields.find((f) => f.role === 'email');
    const desc = pkg.fields.find((f) => f.role === 'long_desc');
    const otherListed = (pkg.otherFields ?? []).some((o) => /mystery/i.test(o.label));

    expect(url?.value).toBe('https://go.chefgaa.com');
    expect(owner?.value).toBe('Arun Kumar');
    expect(oem?.value).toBe('hello@chefgaa.com');
    expect(desc?.value).toContain('bakery operations');
    expect(otherListed).toBe(true);
    expect(pkg.fields.every((f) => f.role !== 'other' || !f.value)).toBe(true);

    // Description must not appear in url/name/email
    for (const f of [url, owner, oem]) {
      expect(f?.value).not.toContain('bakery operations');
    }
  });

  it('self-check clears prose from email and long prose from name', () => {
    expect(valueMatchesRole('email', CONTENT.longDescription!).ok).toBe(false);
    expect(valueMatchesRole('name', CONTENT.longDescription!).ok).toBe(false);
    const cleared = selfCheckPackageFields([
      {
        role: 'email',
        source: 'dom_label',
        confidence: 'high',
        value: CONTENT.longDescription!,
      },
      {
        role: 'name',
        source: 'dom_label',
        confidence: 'high',
        value: CONTENT.longDescription!,
      },
    ]);
    expect(cleared[0]!.value).toBe('');
    expect(cleared[0]!.flagged).toBe(true);
    expect(cleared[1]!.value).toBe('');
    expect(cleared[1]!.flagged).toBe(true);
  });

  it('fills optional auto-fetch Description (long_desc) even when title prefixes the description', () => {
    const content: ContentSource = {
      title: 'ChefGaa kitchen ops for restaurants',
      businessName: 'ChefGaa',
      companyName: 'ChefGaa',
      shortDescription:
        'ChefGaa helps restaurants run prep lists and ticket flow during busy service hours.',
      longDescription:
        'ChefGaa kitchen ops for restaurants — prep lists, ticket flow, and staff coordination in one shared board.',
      metaDescription:
        'ChefGaa kitchen ops — prep lists and ticket flow for restaurant teams.',
      url: 'https://go.chefgaa.com',
      email: 'hello@chefgaa.com',
    };
    // long only from short when long missing
    expect(valueForRole('long_desc', { ...content, longDescription: '' })).toContain('ChefGaa');

    const recipe = buildSiteRecipe({
      domain: 'viesearch.com',
      entryUrl: 'https://viesearch.com/submit',
      html: `
<form>
  <label for="title">Title (Optional) Leave blank to auto-fetch from website</label>
  <input id="title" name="title" type="text" />
  <label for="website">Website URL</label>
  <input id="website" name="website" type="url" required />
  <label for="description">Description (Optional) Leave blank to auto-fetch from website</label>
  <textarea id="description" name="description" maxlength="500"></textarea>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" />
</form>`,
    });
    expect(inferFieldRole({
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
    }).role).toBe('long_desc');

    const pkg = buildAssistedPackage({ recipe, content, formFound: true });
    const title = pkg.fields.find((f) => f.role === 'title');
    const desc = pkg.fields.find((f) => f.role === 'long_desc');
    expect(title?.value.trim().length).toBeGreaterThan(0);
    expect(desc?.value.trim().length).toBeGreaterThan(0);
    expect(desc?.value.length).toBeLessThanOrEqual(200);
    expect(String(desc?.flagReason ?? '')).not.toMatch(/content missing|Content field empty/i);
  });
});

describe('Phase 9 category omission', () => {
  it('sanitizes HTML entities and indent markers (option labels still cleaned in Form Reader)', () => {
    expect(sanitizeOptionLabel('|&nbsp;&nbsp;|__Chats and Forums')).toBe('Chats and Forums');
  });

  it('never puts category fields or recommendations on packages', () => {
    const html = `
<form>
  <label for="title">Title</label>
  <input id="title" name="title" type="text" required maxlength="80" />
  <label for="cat">Category</label>
  <select id="cat" name="category" required>
    <option>Men</option>
    <option>Business &amp; Economy</option>
    <option>Computers &amp; Internet</option>
  </select>
  <label for="url">URL</label>
  <input id="url" name="url" type="url" required />
</form>`;
    const recipe = buildSiteRecipe({
      domain: 'dir.example',
      entryUrl: 'https://dir.example/submit',
      html,
    });
    expect(recipe.fields.some((f) => f.role === 'category')).toBe(true);
    const pkg = buildAssistedPackage({
      recipe,
      content: {
        ...CONTENT,
        categoryHints: ['Business', 'Software', 'POS'],
      },
      formFound: true,
    });
    expect(pkg.fields.some((f) => f.role === 'category')).toBe(false);
    expect(pkg.fields.every((f) => !f.recommendedOption)).toBe(true);
    expect(pkg.categoryNote).toBe('Pick the category yourself on the site');
    // Category must not force Check these fields when other required fields are filled
    expect(pkg.bucket).toBe('ready');
  });

  it('strips legacy category fields and clears check_fields when that was the only issue', () => {
    const base = buildAssistedPackage({
      recipe: buildSiteRecipe({
        domain: 'x.com',
        entryUrl: 'https://x.com/submit',
        html: `
<form>
  <label for="title">Title</label>
  <input id="title" name="title" type="text" required />
  <label for="url">URL</label>
  <input id="url" name="url" type="url" required />
</form>`,
      }),
      content: CONTENT,
      formFound: true,
    });
    const legacy = {
      ...base,
      bucket: 'check_fields' as const,
      fields: [
        ...base.fields,
        {
          selector: '#cat',
          role: 'category' as const,
          label: 'Category',
          value: '',
          charCount: 0,
          maxlength: null,
          required: true,
          confidence: 'low' as const,
          source: 'dom_label' as const,
          options: ['Men', 'Business'],
          recommendedOption: null,
          overLimit: false,
          flagged: true,
          flagReason: 'pick a category — no confident match',
        },
      ],
    };
    const { payload, changed } = stripCategoryFromAssistedPayload(legacy);
    expect(changed).toBe(true);
    expect(payload.fields.some((f) => f.role === 'category')).toBe(false);
    expect(payload.categoryNote).toBe('Pick the category yourself on the site');
    expect(payload.bucket).toBe('ready');
  });
});

describe('Phase 9 strategy media', () => {
  it('skips media for text-only directory forms', () => {
    const d = strategyNeedsMedia({
      hasAttachmentField: false,
      mediaRequirements: { images: true, videos: false }, // type hint ignored
      htmlHasImageUpload: false,
      logoRequired: true, // heuristic ignored
    });
    expect(d.images).toBe(false);
    expect(d.videos).toBe(false);
  });

  it('requires images when recipe has attachment field', () => {
    const d = strategyNeedsMedia({ hasAttachmentField: true });
    expect(d.images).toBe(true);
  });

  it('requires images when HTML has file/image upload', () => {
    const d = strategyNeedsMedia({ htmlHasImageUpload: true });
    expect(d.images).toBe(true);
  });

  it('ignores directory type mediaRequirements alone', () => {
    const d = strategyNeedsMedia({
      mediaRequirements: { images: true, videos: true },
    });
    expect(d.images).toBe(false);
    expect(d.videos).toBe(false);
  });
});
