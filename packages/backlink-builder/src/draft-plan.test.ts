import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, groundFormFieldDraft, planBacklinkDraft } from './draft-plan.js';
import type { UrlScanVerdict } from './url-scanner.js';

function verdict(partial: Partial<UrlScanVerdict>): UrlScanVerdict {
  return {
    requestedUrl: 'https://dir.example/submit',
    finalUrl: 'https://dir.example/submit',
    redirected: false,
    httpStatus: 200,
    fetchError: null,
    broken: false,
    brokenReason: null,
    stop: false,
    parked: false,
    pageKind: 'homepage',
    loginRequired: false,
    loginUrl: null,
    signupRequired: false,
    signupUrl: null,
    captcha: false,
    cloudflare: false,
    forms: [],
    submissionFormIndex: null,
    noForm: true,
    contactEmails: [],
    contactChannels: [],
    pageExcerpt: 'Example page',
    title: '',
    metaDescription: '',
    h1: '',
    nextAction: '',
    linkPolicy: 'unknown',
    linkPolicyEvidence: '',
    suggestedCategory: null,
    categoryFit: 'unknown',
    indexable: true,
    robotsNoindex: false,
    renderedWith: 'fixture',
    truthStatus: 'scanned',
    notes: [],
    ...partial,
  };
}

describe('draft plan', () => {
  it('does not draft a stopped page or an unknown category', () => {
    const stopped = planBacklinkDraft({
      category: null,
      mode: 'stop',
      verdict: verdict({}),
      editorEmail: 'tomparkerofficial02@gmail.com',
    });
    expect(stopped.kind).toBe('none');
    expect(stopped.reason).toMatch(/nothing to send/);
    expect(buildDraftPrompt({
      plan: stopped,
      category: 'unknown',
      clientLabel: 'ChefGaa',
      niche: 'restaurant',
      targetUrl: 'https://go.chefgaa.com/',
      pageUrl: 'https://example.com/',
      pageExcerpt: '',
    })).toBeNull();
  });

  it('does not turn the test mailbox into Dear Tom', () => {
    const plan = planBacklinkDraft({
      category: 'guest_post',
      mode: 'outreach',
      verdict: verdict({ pageKind: 'article', pageExcerpt: 'A food blog with no email.' }),
    });
    expect(plan.kind).toBe('none');
    expect(plan.reason).toMatch(/--to address is only the test mailbox/);
    expect(plan.recipientName).toBeNull();
  });

  it('writes an outreach email only to a contact found on the page, with no invented name', () => {
    const plan = planBacklinkDraft({
      category: 'guest_post',
      mode: 'outreach',
      verdict: verdict({
        pageKind: 'article',
        contactEmails: ['editor@food.example'],
        contactChannels: [{ kind: 'email', value: 'editor@food.example' }],
        pageExcerpt: 'Guest posts welcome. Email editor@food.example.',
      }),
    });
    expect(plan.kind).toBe('outreach_email');
    expect(plan.recipientEmail).toBe('editor@food.example');
    expect(plan.recipientName).toBeNull();
    const prompt = buildDraftPrompt({
      plan,
      category: 'guest_post',
      clientLabel: 'ChefGaa',
      niche: 'restaurant food',
      targetUrl: 'https://go.chefgaa.com/',
      pageUrl: 'https://food.example/write-for-us',
      pageExcerpt: 'Guest posts welcome.',
    });
    expect(prompt).toMatch(/Hello,/);
    expect(prompt).not.toMatch(/Dear Tom/);
    expect(prompt).toMatch(/do not know|unknown/i);
    expect(prompt).toMatch(/ChefGaa/);
  });

  it('fills directory form fields instead of emailing the directory', () => {
    const plan = planBacklinkDraft({
      category: 'directory',
      mode: 'automatic',
      verdict: verdict({
        pageKind: 'submission',
        noForm: false,
        submissionFormIndex: 0,
        forms: [{
          pageUrl: 'https://www.jayde.com/submit.html',
          index: 0,
          kind: 'submission',
          action: '/go',
          isBacklinkSubmission: true,
          fields: [
            { name: 'BUSINESS_NAME', type: 'text', label: 'BUSINESS_NAME', required: false },
            { name: 'XDESCRIPTION', type: 'textarea', label: 'XDESCRIPTION', required: false },
          ],
        }],
      }),
    });
    expect(plan.kind).toBe('form_fields');
    expect(plan.fieldNames).toEqual(['BUSINESS_NAME', 'XDESCRIPTION']);
    const prompt = buildDraftPrompt({
      plan,
      category: 'directory',
      clientLabel: 'ChefGaa',
      niche: 'restaurant',
      targetUrl: 'https://go.chefgaa.com/',
      pageUrl: 'https://www.jayde.com/submit.html',
      pageExcerpt: 'Submit your site',
    })!;
    expect(prompt).toMatch(/JSON object/);
    expect(prompt).toMatch(/Do not write an email/);
    expect(prompt).not.toMatch(/Dear /);
  });

  it('writes pasteable text for an assisted page', () => {
    const plan = planBacklinkDraft({
      category: 'forum',
      mode: 'assisted',
      verdict: verdict({ pageKind: 'login', loginRequired: true, noForm: false }),
    });
    expect(plan.kind).toBe('assisted_content');
    expect(plan.recipientEmail).toBeNull();
  });

  it('drops invented form values and wrong JSON keys', () => {
    const facts = {
      label: 'Chefgaa',
      niche: 'restaurant POS',
      url: 'https://go.chefgaa.com/',
      description: 'All-in-One POS Software for Restaurants.',
    };
    const invented = groundFormFieldDraft(
      JSON.stringify({
        URL: 'https://go.chefgaa.com/',
        EMAIL: 'support@chefgaa.com',
        NAME: 'ChefGaa',
        ADDRESS: 'Go. Chefgaa. com',
        COUNTRY: 'China',
      }),
      ['URL', 'EMAIL', 'NAME', 'ADDRESS', 'COUNTRY', 'XDESCRIPTION'],
      facts
    );
    expect(invented.source).toBe('rules');
    const values = JSON.parse(invented.json) as Record<string, string>;
    expect(values.URL).toBe('https://go.chefgaa.com/');
    expect(values.NAME).toBe('Chefgaa');
    expect(values.EMAIL).toBe('');
    expect(values.ADDRESS).toBe('');
    expect(values.COUNTRY).toBe('');
    expect(values.XDESCRIPTION).toMatch(/Restaurants/);
    expect(invented.json).not.toMatch(/China|support@chefgaa/);

    const wrongKey = groundFormFieldDraft(
      '```json\n{"Type":"Chefgaa"}\n```',
      ['Type the business name you want to add'],
      facts
    );
    expect(wrongKey.source).toBe('rules');
    expect(JSON.parse(wrongKey.json)).toEqual({ 'Type the business name you want to add': 'Chefgaa' });
  });
});