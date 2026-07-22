/**
 * Capability 3 — Contact Form Intelligence fixtures (mock sites only).
 */
import { describe, expect, it } from 'vitest';
import {
  detectContactForm,
  detectContactFormPlatform,
  classifyContactFormIntent,
  extractContactFormFieldMap,
  detectContactFormAntiSpam,
  detectContactFormAttachments,
  generateContactFormMessage,
  selectContactFormStrategy,
  buildContactFormKnowledge,
  summarizeContactFormHealth,
} from '../src/contact-form-intelligence.js';
import { analyzeFetchedSite } from '../src/site-intelligence.js';

const CF7_CONTACT = `
<html><head>
<link href="/wp-content/plugins/contact-form-7/includes/css/styles.css?ver=5.8" />
</head>
<body>
<h1>Contact Us</h1>
<div class="wpcf7">
<form class="wpcf7-form">
<input type="text" name="your-name" required />
<input type="email" name="your-email" required />
<input type="text" name="your-subject" />
<input type="text" name="honeypot" class="wpcf7-pot" tabindex="-1" aria-hidden="true" />
<textarea name="your-message" required maxlength="2000"></textarea>
<div class="g-recaptcha" data-sitekey="x"></div>
<input type="submit" value="Send" />
</form>
</div>
</body></html>`;

const WRITE_FOR_US = `
<html><body>
<h1>Write For Us</h1>
<p>Submit a guest post pitch via this form.</p>
<form>
<input name="name" required />
<input type="email" name="email" required />
<input name="website" type="url" />
<textarea name="message" required></textarea>
<input type="file" name="attachment" accept=".pdf,.docx,image/*" />
<button>Submit</button>
</form>
</body></html>`;

const JOB_FORM = `
<html><body>
<h1>Careers — Job Application</h1>
<form>
<input name="name" />
<input name="email" type="email" />
<input type="file" name="resume" accept=".pdf" />
<textarea name="message"></textarea>
</form>
</body></html>`;

const MEDIA_CONTACT = `
<html><body>
<h1>Press / Media Contact</h1>
<p>Journalists: reach our media desk.</p>
<form>
<input name="name" required />
<input type="email" name="email" required />
<textarea name="message" required></textarea>
</form>
</body></html>`;

describe('Contact form detection + platform', () => {
  it('requires multiple signals', () => {
    const weak = detectContactForm({
      html: '<p>Hello world</p>',
      url: 'https://a.test/',
    });
    expect(weak.detected).toBe(false);

    const strong = detectContactForm({
      html: CF7_CONTACT,
      url: 'https://cf-mock.test/contact',
    });
    expect(strong.detected).toBe(true);
    expect(strong.signals.length).toBeGreaterThanOrEqual(2);
  });

  it('detects Contact Form 7 with version', () => {
    const p = detectContactFormPlatform(CF7_CONTACT, 'https://cf-mock.test/contact');
    expect(p.platform).toBe('Contact Form 7');
    expect(p.version).toBe('5.8');
    expect(p.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe('Intent + fields + anti-spam', () => {
  it('classifies guest post vs job vs media', () => {
    expect(
      classifyContactFormIntent({
        html: WRITE_FOR_US,
        url: 'https://cf-mock.test/write-for-us',
      }).intent
    ).toBe('Write For Us');
    expect(
      classifyContactFormIntent({ html: JOB_FORM, url: 'https://cf-mock.test/careers' }).intent
    ).toBe('Job Application');
    expect(
      classifyContactFormIntent({
        html: MEDIA_CONTACT,
        url: 'https://cf-mock.test/press',
      }).intent
    ).toBe('Media Contact');
  });

  it('maps fields and excludes honeypots', () => {
    const map = extractContactFormFieldMap(CF7_CONTACT);
    expect(map.name).toBe(true);
    expect(map.email).toBe(true);
    expect(map.message).toBe(true);
    expect(map.rawFields).not.toContain('honeypot');
    expect(map.requiredFields.length).toBeGreaterThanOrEqual(2);
  });

  it('detects CAPTCHA and never treats honeypot as visible', () => {
    const spam = detectContactFormAntiSpam(CF7_CONTACT);
    expect(spam.recaptcha).toBe(true);
    expect(spam.requiresHuman).toBe(true);
    expect(spam.honeypot).toBe(true);
  });

  it('detects attachment formats', () => {
    const att = detectContactFormAttachments(WRITE_FOR_US);
    expect(att.accepted).toBe(true);
    expect(att.pdf).toBe(true);
    expect(att.docx).toBe(true);
    expect(att.images).toBe(true);
  });
});

describe('Strategy + messages', () => {
  it('rejects job applications as Unsupported', () => {
    const knowledge = buildContactFormKnowledge({
      homepageUrl: 'https://jobs.test/',
      pages: [{ url: 'https://jobs.test/careers', html: JOB_FORM, status: 'fetched' }],
    })!;
    const s = selectContactFormStrategy({
      formIntent: knowledge.formIntent,
      fieldMap: knowledge.fieldMap,
      attachments: knowledge.attachments,
      antiSpam: knowledge.antiSpam,
    });
    expect(s.strategy).toBe('Unsupported');
    expect(s.suitable).toBe(false);
  });

  it('selects Guest Post for write-for-us and unique message', () => {
    const knowledge = buildContactFormKnowledge({
      homepageUrl: 'https://blog.test/',
      pages: [{ url: 'https://blog.test/write-for-us', html: WRITE_FOR_US, status: 'fetched' }],
      businessText: 'Acme Analytics',
    })!;
    expect(knowledge.workflow).toBe('Guest Post');
    const msg = generateContactFormMessage('Guest Post', 'Acme Analytics');
    const general = generateContactFormMessage('General Outreach', 'Acme Analytics');
    expect(msg.bodyOutline).not.toEqual(general.bodyOutline);
    expect(msg.tone).toContain('editorial');
  });

  it('media contact → Media Request (not failure)', () => {
    const knowledge = buildContactFormKnowledge({
      homepageUrl: 'https://press.test/',
      pages: [{ url: 'https://press.test/press', html: MEDIA_CONTACT, status: 'fetched' }],
    })!;
    expect(knowledge.workflow).toBe('Media Request');
  });

  it('analyzeFetchedSite wires CF7 contact strategy + CAPTCHA intervention', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://cf-mock.test/',
      pages: [
        {
          url: 'https://cf-mock.test/',
          html: '<html><body><a href="/contact">Contact</a></body></html>',
          status: 'fetched',
          depth: 0,
        },
        {
          url: 'https://cf-mock.test/contact',
          html: CF7_CONTACT,
          status: 'fetched',
          depth: 1,
        },
      ],
      businessText: 'Acme POS',
    });
    expect(result.contactForm?.detected).toBe(true);
    expect(result.contactForm?.platform).toBe('Contact Form 7');
    expect(result.strategy.entryUrl).toContain('contact');
    expect(result.strategy.contactFormStrategy).toBe('General Outreach');
    expect(result.strategy.expectedInterventions).toContain('CAPTCHA');
    expect(result.strategy.payloadHints?.neverAutoSolveCaptcha).toBe(true);
    expect(result.strategy.payloadHints?.messageTemplate).toBeTruthy();
    expect(result.profileStatus).toBe('complete');
  });
});

describe('Contact Form Health', () => {
  it('summarizes supported / captcha counts', () => {
    const health = summarizeContactFormHealth([
      {
        fingerprint: {
          contactForm: {
            detected: true,
            workflow: 'General Outreach',
            antiSpam: { requiresHuman: true },
          },
        },
        strategy: {
          contactFormStrategy: 'General Outreach',
          expectedInterventions: ['CAPTCHA'],
        },
        learning: { contactForm: { successRate: 0.8, averageSubmissionTimeMs: 12000 } },
      },
      {
        fingerprint: {
          contactForm: {
            detected: true,
            workflow: 'Unsupported',
            antiSpam: { requiresHuman: false },
          },
        },
        strategy: { contactFormStrategy: 'Unsupported' },
      },
    ] as Parameters<typeof summarizeContactFormHealth>[0]);
    expect(health.detected).toBe(2);
    expect(health.supported).toBe(1);
    expect(health.unsupported).toBe(1);
    expect(health.captcha).toBe(1);
  });
});
