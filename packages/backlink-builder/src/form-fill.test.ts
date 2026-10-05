import { describe, expect, it } from 'vitest';
import { findSubmitControl, findSubmitSelector, planFormFill } from './form-fill.js';
import { shouldBlockAutoSubmit } from './detector-registry.js';

/** A directory form that does not use input[name] for the listing fields. */
const DIRECTORY_FIXTURE = `
<html><body>
<h1>Submit your site</h1>
<form action="/submit.php" method="post">
  <label for="biz">Business name</label>
  <input id="biz" type="text" />
  <label for="site">Website URL</label>
  <input id="site" type="url" placeholder="https://" />
  <label for="mail">Email</label>
  <input id="mail" type="email" autocomplete="email" />
  <label for="about">Description</label>
  <textarea id="about" placeholder="Tell us about the business"></textarea>
  <label for="phone">Phone</label>
  <input id="phone" aria-label="Phone number" autocomplete="tel" />
  <label for="cat">Category</label>
  <select id="cat">
    <option value="">Select a category</option>
    <option>Marketing</option>
    <option>Health</option>
  </select>
  <label><input type="checkbox" id="tos" /> I agree to the terms and privacy policy</label>
  <button class="btn-primary">Submit listing</button>
</form>
</body></html>`;

const VALUES = {
  __canonical: {
    businessName: 'Acme Widgets',
    landingPage: 'https://acme.example',
    email: 'ada@acme.example',
    description: 'Acme builds widgets for local shops.',
    phone: '+1 555 0100',
    categories: 'Marketing',
  },
};

describe('directory form fill', () => {
  it('matches label, placeholder, id, aria-label, and autocomplete', () => {
    const plan = planFormFill(DIRECTORY_FIXTURE, VALUES);
    const byIntent = Object.fromEntries(plan.map((a) => [a.intent, a]));
    expect(byIntent.business_name?.value).toBe('Acme Widgets');
    expect(byIntent.business_name?.via).toBe('label');
    expect(byIntent.business_name?.selector).toContain('biz');
    expect(byIntent.url?.value).toBe('https://acme.example');
    expect(byIntent.email?.value).toBe('ada@acme.example');
    expect(['autocomplete', 'label', 'type']).toContain(byIntent.email?.via);
    expect(byIntent.description?.value).toContain('widgets');
    expect(byIntent.phone?.via === 'aria-label' || byIntent.phone?.via === 'autocomplete' || byIntent.phone?.via === 'label').toBe(true);
    expect(byIntent.category?.kind).toBe('select');
    expect(byIntent.category?.value).toBe('Marketing');
    expect(byIntent.terms?.kind).toBe('check');
  });

  it('finds a submit button that is not type=submit', () => {
    const control = findSubmitControl(DIRECTORY_FIXTURE);
    expect(control?.text).toMatch(/Submit listing/i);
    expect(control?.type).not.toBe('submit');
    expect(findSubmitSelector(DIRECTORY_FIXTURE)).toMatch(/Submit listing/);
  });

  it('does not treat a captcha page submit control as auto-clickable', () => {
    const html = DIRECTORY_FIXTURE.replace(
      '<button class="btn-primary">Submit listing</button>',
      '<div class="g-recaptcha" data-sitekey="site"></div><button class="btn-primary">Submit listing</button>'
    );
    expect(findSubmitControl(html)?.text).toMatch(/Submit listing/);
    expect(shouldBlockAutoSubmit(html)).toBe('captcha');
  });

  it('fills a citation form from placeholder and aria-label when labels are missing', () => {
    const html = `
      <form>
        <input placeholder="Company name" id="c" />
        <input aria-label="Website" id="w" />
        <input autocomplete="email" id="e" />
        <button type="button">Add business</button>
      </form>`;
    const plan = planFormFill(html, {
      company: 'Northwind',
      website: 'https://northwind.example',
      email: 'hi@northwind.example',
    });
    expect(plan.find((a) => a.intent === 'business_name')?.value).toBe('Northwind');
    expect(plan.find((a) => a.intent === 'business_name')?.via).toBe('placeholder');
    expect(plan.find((a) => a.intent === 'url')?.via).toBe('aria-label');
    expect(plan.find((a) => a.intent === 'email')?.via).toBe('autocomplete');
    expect(findSubmitControl(html)?.text).toMatch(/Add business/);
    expect(findSubmitControl(html)?.type).toBe('button');
  });
});
