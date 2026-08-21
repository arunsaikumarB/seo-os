import { describe, expect, it } from 'vitest';
import {
  activeFieldsForSubmissionType,
  buildTypedContentViews,
  classifySubmissionType,
  submissionTypeFromStorage,
} from './submission-type.js';
import { classifyProbedPage } from './link-probe.js';

const PLIGG_HTML = `
<html><head><title>Submit dirstop.com</title></head>
<body>
  <h2>Article Details</h2>
  <form action="/submit">
    <label>Story Title</label>
    <input name="title" placeholder="Please enter the title of the story you are linking to. (max 400 characters)" />
    <label>Tags</label>
    <input name="tags" placeholder="Examples: web, programming, free software" />
    <label>Description</label>
    <textarea name="body">Write your own description of the news story you are submitting. It should be about 2 to 4 sentences long.</textarea>
    <label>URL</label>
    <input name="url" />
    <img alt="CAPTCHA" src="/captcha.png" />
    <label>CAPTCHA</label>
    <input name="recaptcha_response_field" />
    <button type="submit">Submit Story</button>
  </form>
</body></html>
`;

describe('classifySubmissionType', () => {
  it('classifies Pligg-style social bookmark forms', () => {
    const r = classifySubmissionType({
      url: 'https://dirstop.com/submit',
      title: 'Submit dirstop.com',
      headings: ['Article Details'],
      labels: ['Story Title', 'Tags', 'Description', 'CAPTCHA'],
      placeholders: [
        'Please enter the title of the story you are linking to. (max 400 characters)',
        'Examples: web, programming, free software',
        'Write your own description of the news story you are submitting. It should be about 2 to 4 sentences long.',
      ],
      buttons: ['Submit Story'],
      visibleText: 'Article Details Story Title Tags Description news story',
    });
    expect(r.submissionType).toBe('SOCIAL_BOOKMARK');
    expect(r.submissionTypeConfidence).toBeGreaterThanOrEqual(0.9);
    expect(r.submissionTypeEvidence.join(' ')).toMatch(/Story Title|Tags|Article Details/i);
  });

  it('classifies business directory forms', () => {
    const r = classifySubmissionType({
      url: 'https://example.com/add-listing',
      labels: [
        'Business Name',
        'Company Name',
        'Website',
        'Email',
        'Phone',
        'Address',
        'City',
        'State',
        'Country',
        'Category',
        'Description',
      ],
      buttons: ['Submit Listing'],
    });
    expect(r.submissionType).toBe('BUSINESS_DIRECTORY');
    expect(r.submissionTypeConfidence).toBeGreaterThanOrEqual(0.55);
  });

  it('classifies web2 article forms (not social bookmark)', () => {
    const r = classifySubmissionType({
      url: 'https://blog.example.com/write-article',
      labels: ['Article Title', 'Article Body', 'Excerpt', 'Tags', 'Author'],
      buttons: ['Publish Article', 'Submit Article'],
      headings: ['New Article', 'Write Article'],
    });
    expect(r.submissionType).toBe('WEB2_ARTICLE');
  });

  it('classifies profile forms', () => {
    const r = classifySubmissionType({
      labels: ['Username', 'Display Name', 'About Me', 'Avatar', 'Profile URL', 'Website'],
      buttons: ['Create Profile'],
    });
    expect(r.submissionType).toBe('PROFILE');
  });

  it('classifies forum forms', () => {
    const r = classifySubmissionType({
      labels: ['Topic Title', 'Message Body', 'Signature'],
      buttons: ['New Thread', 'Post Reply'],
      headings: ['Forum Community'],
    });
    expect(r.submissionType).toBe('FORUM');
  });

  it('classifies blog comments', () => {
    const r = classifySubmissionType({
      labels: ['Name', 'Email', 'Website', 'Comment'],
      buttons: ['Post Comment'],
      headings: ['Leave a Comment'],
    });
    expect(r.submissionType).toBe('BLOG_COMMENT');
  });

  it('classifies press releases', () => {
    const r = classifySubmissionType({
      labels: ['Headline', 'Dateline', 'Summary', 'Body', 'Contact Information', 'Release Date'],
      headings: ['Press Release'],
    });
    expect(r.submissionType).toBe('PRESS_RELEASE');
  });

  it('does not classify merely because of the word link', () => {
    const r = classifySubmissionType({
      labels: ['Your email', 'Subscribe'],
      buttons: ['Join our newsletter'],
      visibleText: 'Get our weekly link digest newsletter',
    });
    expect(r.submissionType).not.toBe('SOCIAL_BOOKMARK');
  });
});

describe('link probe submission type', () => {
  it('stamps SOCIAL_BOOKMARK on Pligg HTML', () => {
    const probe = classifyProbedPage({
      url: 'https://webcastlist.com/submit',
      html: PLIGG_HTML,
      httpStatus: 200,
    });
    expect(probe.submissionType).toBe('SOCIAL_BOOKMARK');
    expect(probe.submissionTypeConfidence).toBeGreaterThanOrEqual(0.85);
    expect(probe.gates.some((g) => g === 'captcha') || probe.reasons.join(' ').includes('type:')).toBe(
      true
    );
  });
});

describe('typed content + project isolation', () => {
  it('builds Desi Dhamaka social bookmark package without Chefgaa', () => {
    const views = buildTypedContentViews({
      businessName: 'Desi Dhamaka',
      title: 'Desi Dhamaka — Authentic Indian Restaurant',
      shortDescription: 'Family-owned Indian dining in your city.',
      keywords: 'indian restaurant, desi food, tandoori',
      url: 'https://desidhamaka.example',
      email: 'hello@desidhamaka.example',
    });
    expect(views.socialBookmarkContent.title).toMatch(/Desi Dhamaka/i);
    expect(views.socialBookmarkContent.url).toBe('https://desidhamaka.example');
    expect(views.socialBookmarkContent.tags).toMatch(/indian restaurant/i);
    const blob = JSON.stringify(views);
    expect(blob.toLowerCase()).not.toMatch(/chefgaa/);

    const fields = activeFieldsForSubmissionType('SOCIAL_BOOKMARK', views);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey.title).toMatch(/Desi Dhamaka/i);
    expect(byKey.keywords).toMatch(/indian/i);
    expect(byKey.url).toBe('https://desidhamaka.example');
  });

  it('replaces package when switching to Chefgaa', () => {
    const desi = buildTypedContentViews({
      businessName: 'Desi Dhamaka',
      title: 'Desi Dhamaka Story',
      shortDescription: 'Indian restaurant',
      keywords: 'desi',
      url: 'https://desidhamaka.example',
    });
    const chef = buildTypedContentViews({
      businessName: 'Chefgaa',
      title: 'Chefgaa Restaurant POS',
      shortDescription: 'Restaurant management software',
      keywords: 'pos, ordering',
      url: 'https://go.chefgaa.com',
    });
    const desiFields = activeFieldsForSubmissionType('SOCIAL_BOOKMARK', desi);
    const chefFields = activeFieldsForSubmissionType('SOCIAL_BOOKMARK', chef);
    expect(desiFields.find((f) => f.key === 'url')?.value).toContain('desidhamaka');
    expect(chefFields.find((f) => f.key === 'url')?.value).toContain('chefgaa');
    expect(JSON.stringify(chefFields).toLowerCase()).not.toMatch(/desi dhamaka/);
  });

  it('maps storage types', () => {
    expect(submissionTypeFromStorage('social_bookmark', null)).toBe('SOCIAL_BOOKMARK');
    expect(submissionTypeFromStorage('web2', 'blog_submission')).toBe('WEB2_ARTICLE');
    expect(submissionTypeFromStorage('directory', 'business_directory')).toBe(
      'BUSINESS_DIRECTORY'
    );
  });
});
