/**
 * Phase 9 — role-value binding, category sanitize, media skip.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAssistedPackage,
  buildSiteRecipe,
  inferFieldRole,
  recommendDropdownOption,
  sanitizeOptionLabel,
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

describe('Phase 9 category handling', () => {
  it('sanitizes HTML entities and indent markers', () => {
    expect(sanitizeOptionLabel('|&nbsp;&nbsp;|__Chats and Forums')).toBe('Chats and Forums');
  });

  it('recommends brand-relevant option, not first chat/forum bucket', () => {
    const opts = [
      'Chats and Forums',
      'Business Software',
      'Shopping',
    ];
    const pick = recommendDropdownOption(opts, ['Business', 'Software', 'platform']);
    expect(pick).toBe('Business Software');
  });

  it('returns null instead of blindly picking options[0]', () => {
    const pick = recommendDropdownOption(['Chats and Forums', 'Random Niche'], [
      'Quantum Astrophysics',
    ]);
    expect(pick).toBeNull();
  });

  it('does not pick Men via substring of management for a restaurant POS brand', () => {
    const opts = [
      'Men',
      'Women',
      'Business & Economy',
      'Computers & Internet',
      'Arts',
      'Shopping',
    ];
    const pick = recommendDropdownOption(opts, [
      'Chefgaa',
      'restaurant POS',
      'restaurant management software',
      'point of sale',
      'business software',
    ]);
    expect(pick).not.toBe('Men');
    expect(pick).not.toBe('Women');
    expect(['Business & Economy', 'Computers & Internet']).toContain(pick);
  });

  it('leaves empty + no guess when nothing fits', () => {
    const pick = recommendDropdownOption(
      ['Men', 'Women', 'Dating', 'Adult'],
      ['Chefgaa', 'restaurant POS software', 'business']
    );
    expect(pick).toBeNull();
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
