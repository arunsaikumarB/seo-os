import { describe, expect, it } from 'vitest';
import {
  buildDirectoryFormSchema,
  mapToCanonicalField,
  populateDirectoryFormFromProfile,
  suggestDirectoryCategory,
  detectDirectorySchemaDrift,
  applyDirectoryFieldReview,
} from './directory-form-schema.js';

const CIPINET_HTML = `
<html><body>
  <h1>Submit Free Listing</h1>
  <h2>Site Submission Form</h2>
  <form action="/suggest.php">
    <label for="cat">Category:</label>
    <select id="cat" name="category" required>
      <option>Arts</option>
      <option>Business</option>
      <option>Computers</option>
      <option>Games</option>
      <option>Health</option>
      <option>Food And Beverage</option>
      <option>Restaurants</option>
    </select>
    <label for="url">URL:</label>
    <input id="url" type="text" name="url" value="https://" required />
    <label for="title">Site Title:</label>
    <input id="title" type="text" name="title" required />
    <label for="desc">Description:</label>
    <textarea id="desc" name="description" maxlength="230"></textarea>
    <span>230 characters remaining</span>
    <label for="email">E-Mail:</label>
    <input id="email" type="email" name="email" required />
    <div class="g-recaptcha" data-sitekey="x"></div>
    <label><input type="checkbox" name="agree" required /> By submitting a site, you agree to terms of service.</label>
    <button type="submit">Click to Submit</button>
  </form>
</body></html>
`;

const MINIMAL_URL_HTML = `
<html><body>
  <h1>Add Your URL Here</h1>
  <form action="/add-url.php">
    <label for="u">URL:</label>
    <input id="u" type="text" name="url" />
    <input type="submit" value="Add URL" />
  </form>
  <a href="#">Bookmark and Share</a>
</body></html>
`;

const JAYDE_HTML = `
<html><body>
  <form action="/submit.html">
    <label for="url">Your URL:</label>
    <input id="url" name="url" value="https://" />
    <label for="email">Your email:</label>
    <input id="email" name="email" placeholder="Please use your company email address." />
    <h3>Optional Information</h3>
    <label for="contact_name">Your name:</label><input id="contact_name" name="contact_name" />
    <label for="business_name">Business name:</label><input id="business_name" name="business_name" />
    <label for="address">Your business street address:</label><input id="address" name="address" />
    <label for="phone">Business phone number (with country &amp; area codes):</label><input id="phone" name="phone" />
    <label for="zip">zip/postal code:</label><input id="zip" name="zip" />
    <label for="country">Country:</label>
    <select id="country" name="country"><option>United States</option><option>Canada</option></select>
    <label for="state">State or Province (Canada/USA):</label>
    <select id="state" name="state"><option>California</option><option>Ontario</option></select>
    <label for="industry">Industry:</label>
    <select id="industry" name="industry">
      <option>Advertising And Marketing</option>
      <option>Food And Beverage</option>
      <option>Industrial</option>
      <option>Hospitality</option>
    </select>
    <label for="description">Business description:</label>
    <textarea id="description" name="description"></textarea>
    <label for="facebook">Facebook URL:</label><input id="facebook" name="facebook" />
    <label for="googleplus">Google+ profile URL:</label><input id="googleplus" name="googleplus" />
    <label for="twitter">Twitter account name:</label><input id="twitter" name="twitter" />
    <label for="twellow">Twellow account name:</label><input id="twellow" name="twellow" />
    <label for="youtube">YouTube URL:</label><input id="youtube" name="youtube" />
    <label for="logo">Company logo image URL:</label><input id="logo" name="logo" />
    <label for="gmaps">Google maps URL:</label><input id="gmaps" name="gmaps" />
    <button type="submit">Add my Site</button>
  </form>
</body></html>
`;

describe('mapToCanonicalField', () => {
  it('maps URL label variants to website_url', () => {
    for (const label of ['Your URL', 'Website', 'Site URL', 'Website Address', 'URL']) {
      expect(mapToCanonicalField({ label }).field).toBe('website_url');
    }
  });

  it('maps business / company names', () => {
    expect(mapToCanonicalField({ label: 'Business Name' }).field).toBe('business_name');
    expect(mapToCanonicalField({ label: 'Company Name' }).field).toBe('company_name');
  });

  it('maps postal variants', () => {
    expect(mapToCanonicalField({ label: 'ZIP' }).field).toBe('postal_code');
    expect(mapToCanonicalField({ label: 'Postal Code' }).field).toBe('postal_code');
    expect(mapToCanonicalField({ label: 'ZIP/Postal Code' }).field).toBe('postal_code');
  });
});

describe('buildDirectoryFormSchema — reference patterns', () => {
  it('Cipinet-style: category, url, title, description(230), email, captcha, terms', () => {
    const schema = buildDirectoryFormSchema({
      html: CIPINET_HTML,
      directoryUrl: 'https://cipinet.com/suggest.php?action=addlink&TID=sf',
      businessCategory: 'Restaurant',
    });
    const byCanon = Object.fromEntries(schema.fields.map((f) => [f.canonicalField, f]));
    expect(byCanon.website_url).toBeTruthy();
    expect(byCanon.title).toBeTruthy();
    expect(byCanon.description?.maxLength).toBe(230);
    expect(byCanon.email || byCanon.company_email).toBeTruthy();
    expect(byCanon.category).toBeTruthy();
    expect(schema.captcha.present).toBe(true);
    expect(schema.captcha.kinds).toContain('recaptcha');
    expect(schema.terms.present).toBe(true);
    expect(schema.formPatternHint).toBe('classic_directory');
    expect(schema.categories.suggestedMatch).toMatch(/Restaurant|Food/i);
  });

  it('Secret Search Engine Labs-style: URL only', () => {
    const schema = buildDirectoryFormSchema({
      html: MINIMAL_URL_HTML,
      directoryUrl: 'http://secretsearchenginelabs.com/add-url.php',
    });
    const fillable = schema.fields.filter(
      (f) => !['captcha', 'terms_acceptance', 'unknown'].includes(f.canonicalField)
    );
    expect(fillable.some((f) => f.canonicalField === 'website_url')).toBe(true);
    expect(fillable.length).toBeLessThanOrEqual(2);
    expect(schema.formPatternHint).toBe('minimal_url_only');
  });

  it('Jayde-style: rich business + social fields', () => {
    const schema = buildDirectoryFormSchema({
      html: JAYDE_HTML,
      directoryUrl: 'https://jayde.com/submit.html',
      businessCategory: 'Food / Restaurant',
    });
    const keys = new Set(schema.fields.map((f) => f.canonicalField));
    expect(keys.has('website_url')).toBe(true);
    expect(keys.has('email') || keys.has('company_email')).toBe(true);
    expect(keys.has('business_name')).toBe(true);
    expect(keys.has('street_address') || keys.has('phone')).toBe(true);
    expect(keys.has('facebook_url')).toBe(true);
    expect(keys.has('youtube_url')).toBe(true);
    expect(keys.has('logo_url')).toBe(true);
    expect(schema.formPatternHint).toBe('rich_business_directory');
    expect(schema.categories.suggestedMatch).toBe('Food And Beverage');
  });
});

describe('category suggestion — never invent', () => {
  it('returns null when no safe match', () => {
    const r = suggestDirectoryCategory('Quantum Computing', ['Arts', 'Sports']);
    expect(r.match).toBeNull();
  });

  it('only returns values from the directory list', () => {
    const opts = ['Food And Beverage', 'Industrial'];
    const r = suggestDirectoryCategory('Restaurant', opts);
    expect(r.match).toBeTruthy();
    expect(opts).toContain(r.match!);
  });
});

describe('populate + review + drift', () => {
  it('auto-populates profile fields and truncates description to maxLength', () => {
    const schema = buildDirectoryFormSchema({
      html: CIPINET_HTML,
      directoryUrl: 'https://cipinet.com/suggest.php',
    });
    const populated = populateDirectoryFormFromProfile(schema, {
      businessName: 'Desi Dhamaka',
      websiteUrl: 'https://desidhamaka.example',
      email: 'hello@desidhamaka.example',
      title: 'Desi Dhamaka Indian Restaurant',
      description: 'A'.repeat(400),
      category: 'Restaurant',
    });
    const desc = populated.fields.find((f) => f.canonicalField === 'description');
    expect(desc?.defaultValue?.length).toBe(230);
    expect(desc?.fillStatus).toBe('auto_populated');
    const url = populated.fields.find((f) => f.canonicalField === 'website_url');
    expect(url?.defaultValue).toContain('desidhamaka');
    expect(populated.fields.find((f) => f.canonicalField === 'captcha')?.fillStatus).toBe(
      'needs_manual_verification'
    );
  });

  it('marks reviewed after human correction', () => {
    const schema = buildDirectoryFormSchema({
      html: MINIMAL_URL_HTML,
      directoryUrl: 'http://secretsearchenginelabs.com/add-url.php',
    });
    const urlField = schema.fields.find((f) => f.canonicalField === 'website_url')!;
    const reviewed = applyDirectoryFieldReview(schema, [
      { selector: urlField.selector, canonicalField: 'website_url' },
    ]);
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.reviewRequired).toBe(false);
  });

  it('detects drift when fields change', () => {
    const a = buildDirectoryFormSchema({
      html: MINIMAL_URL_HTML,
      directoryUrl: 'http://example.com/add',
    });
    const b = buildDirectoryFormSchema({
      html: CIPINET_HTML,
      directoryUrl: 'http://example.com/add',
    });
    const drift = detectDirectorySchemaDrift(a, b);
    expect(drift.changed).toBe(true);
    expect(drift.reasons.length).toBeGreaterThan(0);
  });
});
