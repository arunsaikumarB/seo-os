/**
 * Phase 10 — target form selection (never merge login + submit).
 */
import { describe, expect, it } from 'vitest';
import {
  buildAssistedPackage,
  buildSiteRecipe,
  extractFormFieldFacts,
  extractTargetFormFieldFacts,
  inferFieldRole,
} from './assisted-manual.js';
import {
  disqualifyForm,
  enumerateHtmlForms,
  scanFormControls,
  selectTargetForm,
} from './target-form.js';

const MARKETING_DIR_PAGE = `
<html><body>
  <form action="/login" method="post" id="loginWidget">
    <label>User</label><input type="text" name="user" />
    <label>Pass</label><input type="password" name="pass" />
    <label><input type="checkbox" name="rememberMe" /> Remember me</label>
    <button type="submit">Log in</button>
  </form>
  <form action="/submit" method="post" id="listingSubmit">
    <label for="TITLE">Title</label>
    <input id="TITLE" name="TITLE" type="text" maxlength="100" required />
    <label for="SHORT">Short Description (250 characters)</label>
    <textarea id="SHORT" name="SHORT_DESCRIPTION" maxlength="250" required></textarea>
    <label for="ARTICLE">Article (5000 characters)</label>
    <textarea id="ARTICLE" name="ARTICLE" maxlength="5000" required></textarea>
    <label for="YNAME">Your Name</label>
    <input id="YNAME" name="YOUR_NAME" type="text" />
    <label for="YEMAIL">Your Email</label>
    <input id="YEMAIL" name="YOUR_EMAIL" type="email" />
    <label for="CAT">Category</label>
    <select id="CAT" name="CATEGORY">
      <option>Business</option>
      <option>Chats and Forums</option>
    </select>
    <label for="LTYPE">Link Type</label>
    <select id="LTYPE" name="LINK_TYPE">
      <option>Normal</option>
      <option>Reciprocal</option>
    </select>
    <label for="URL">URL</label>
    <input id="URL" name="URL" type="text" />
    <img src="/captcha.png" alt="captcha" />
    <label for="CODE">Enter the code shown</label>
    <input id="CODE" name="CAPTCHA" type="text" />
    <label><input type="checkbox" name="AGREE" required /> I agree to the submission rules</label>
    <button type="submit">Submit</button>
  </form>
</body></html>
`;

describe('Phase 10 target form selection', () => {
  it('enumerates forms separately and disqualifies login', () => {
    const forms = enumerateHtmlForms(MARKETING_DIR_PAGE);
    expect(forms).toHaveLength(2);
    const login = forms[0]!;
    const loginControls = scanFormControls(login.fullHtml);
    expect(disqualifyForm(login.fullHtml, loginControls)).toBe('password_login');
  });

  it('picks the listing submit form — never merges user/pass/rememberMe', () => {
    const pick = selectTargetForm(MARKETING_DIR_PAGE);
    expect(pick.formFound).toBe(true);
    expect(pick.form?.id).toBe('listingSubmit');
    expect(pick.disqualified.some((d) => d.reason === 'password_login')).toBe(true);

    const target = extractTargetFormFieldFacts(MARKETING_DIR_PAGE);
    const names = target.fields.map((f) => f.name);
    expect(names).not.toContain('user');
    expect(names).not.toContain('pass');
    expect(names).not.toContain('rememberMe');
    expect(names).toContain('TITLE');
    expect(names).toContain('SHORT_DESCRIPTION');
    expect(names).toContain('ARTICLE');
    expect(names).toContain('YOUR_NAME');
    expect(names).toContain('YOUR_EMAIL');
  });

  it('reads real maxlength 250 / 5000', () => {
    const target = extractTargetFormFieldFacts(MARKETING_DIR_PAGE);
    const short = target.fields.find((f) => f.id === 'SHORT');
    const article = target.fields.find((f) => f.id === 'ARTICLE');
    expect(short?.maxlength).toBe(250);
    expect(article?.maxlength).toBe(5000);
  });

  it('surfaces captcha/agreement as you-must human steps, not fillable empties', () => {
    const recipe = buildSiteRecipe({
      domain: 'marketinginternetdirectory.com',
      entryUrl: 'https://www.marketinginternetdirectory.com/submit',
      html: MARKETING_DIR_PAGE,
    });
    expect(recipe.targetFormSelector).toContain('listingSubmit');
    expect(recipe.fields.some((f) => f.role === 'captcha')).toBe(false);
    expect(recipe.fields.some((f) => f.role === 'terms')).toBe(false);
    expect(recipe.humanSteps?.join(' ')).toMatch(/code shown/i);
    expect(recipe.humanSteps?.join(' ')).toMatch(/agreement/i);

    const pkg = buildAssistedPackage({
      recipe,
      content: {
        title: 'Chefgaa',
        shortDescription: 'Bakery ops tools for local shops.',
        longDescription: 'Chefgaa helps bakeries manage orders and staffing from one place.',
        contactName: 'Arun',
        email: 'hello@chefgaa.com',
        url: 'https://go.chefgaa.com',
        categoryHints: ['Business'],
      },
    });
    expect(pkg.fields.some((f) => /captcha|agree/i.test(f.label))).toBe(false);
    expect(pkg.gateNotes).toMatch(/you must:/i);
    expect(pkg.humanSteps?.length).toBeGreaterThan(0);
  });

  it('never assigns website URL to LINK_TYPE select', () => {
    const linkType = extractFormFieldFacts(MARKETING_DIR_PAGE).find((f) => f.name === 'LINK_TYPE')!;
    // extract from full page for role unit test
    const role = inferFieldRole(linkType);
    expect(role.role).not.toBe('url');

    const recipe = buildSiteRecipe({
      domain: 'marketinginternetdirectory.com',
      entryUrl: 'https://example.com/submit',
      html: MARKETING_DIR_PAGE,
    });
    const lt = recipe.fields.find((f) => /LINK_TYPE/i.test(f.selector) || f.label === 'Link Type');
    expect(lt?.role).not.toBe('url');
    const pkg = buildAssistedPackage({
      recipe,
      content: {
        title: 'X',
        url: 'https://go.chefgaa.com',
        shortDescription: 'Short enough text here.',
        longDescription: 'A longer description that clears the minimum length requirement for articles.',
      },
    });
    const filled = pkg.fields.find((f) => /LINK_TYPE|Link Type/i.test(f.label + f.selector));
    expect(filled?.value ?? '').not.toBe('https://go.chefgaa.com');
    expect(filled).toBeUndefined(); // not a mapped content field
    const other = pkg.otherFields?.find((o) => /LINK_TYPE|Link Type/i.test(o.label + o.selector));
    expect(other).toBeTruthy();
    expect(other?.humanStep).toMatch(/you choose/i);
  });

  it('honest failure when only a login form exists', () => {
    const html = `
<form action="/login">
  <input name="user" /><input type="password" name="pass" />
</form>`;
    const pick = selectTargetForm(html);
    expect(pick.formFound).toBe(false);
    expect(pick.failureReason).toMatch(/login|newsletter|search|No submission form/i);

    const recipe = buildSiteRecipe({
      domain: 'x.com',
      entryUrl: 'https://x.com/login',
      html,
    });
    expect(recipe.formFound).toBe(false);
    expect(recipe.fields).toHaveLength(0);
    const pkg = buildAssistedPackage({
      recipe,
      content: { title: 'X' },
      formFound: false,
      discoveryFailureReason: recipe.formFailureReason,
    });
    expect(pkg.bucket).toBe('needs_person');
    expect(pkg.failureReason).toMatch(/No submission form/i);
  });

  it('locks re-read to the same target form selector', () => {
    const first = buildSiteRecipe({
      domain: 'marketinginternetdirectory.com',
      entryUrl: 'https://example.com/submit',
      html: MARKETING_DIR_PAGE,
    });
    const second = buildSiteRecipe({
      domain: 'marketinginternetdirectory.com',
      entryUrl: 'https://example.com/submit',
      html: MARKETING_DIR_PAGE,
      existing: first,
    });
    expect(second.targetFormSelector).toBe(first.targetFormSelector);
    expect(second.targetFormIndex).toBe(first.targetFormIndex);
  });
});
