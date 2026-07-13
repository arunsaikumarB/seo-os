import { describe, expect, it } from 'vitest';
import {
  deduplicateAndValidate,
  extractUrlsFromCsv,
  extractUrlsFromSheetRows,
  normalizeUrl,
  discoverWebsiteCandidates,
  classifyOpportunity,
  analyzeDomain,
  inspectBacklinkHtml,
  estimateReviewHours,
  generateGuestPostPack,
} from '../src/index.js';

describe('import parser', () => {
  it('normalizes and deduplicates URLs', () => {
    const { stats } = deduplicateAndValidate([
      'https://moz.com',
      'http://www.moz.com/',
      'not a url',
      'ahrefs.com',
    ]);
    expect(stats.valid).toBe(2);
    expect(stats.duplicates).toBe(1);
    expect(stats.invalid).toBe(1);
  });

  it('extracts URL column from CSV', () => {
    const urls = extractUrlsFromCsv('Website,Name\nhttps://dev.to,Dev\nhttps://medium.com,Medium');
    expect(urls).toEqual(['https://dev.to', 'https://medium.com']);
  });

  it('extracts URLs from sheet rows', () => {
    const urls = extractUrlsFromSheetRows([
      ['url', 'notes'],
      ['https://quora.com', 'qa'],
      ['reddit.com', 'forum'],
    ]);
    expect(urls[0]).toContain('quora');
    expect(normalizeUrl(urls[1])).toContain('reddit.com');
  });
});

describe('discovery', () => {
  it('returns real domains without example placeholders', () => {
    const candidates = discoverWebsiteCandidates({
      industry: 'marketing',
      keywords: ['seo', 'content'],
      targetDr: 20,
    });
    expect(candidates.length).toBeGreaterThan(5);
    expect(candidates.every((c) => !c.domain.includes('example'))).toBe(true);
    expect(candidates.every((c) => c.metricsSource === 'estimated')).toBe(true);
  });
});

describe('classification', () => {
  it('labels probabilistic fields as estimated', () => {
    const analysis = analyzeDomain('moz.com');
    const result = classifyOpportunity(analysis, { projectIndustry: 'marketing' });
    expect(result.estimated).toBe(true);
    expect(result.difficulty).toBeGreaterThan(0);
    expect(result.metricsSource).toBe('estimated');
  });
});

describe('verification', () => {
  it('detects target URL and nofollow in HTML', () => {
    const html = `<html><body><a href="https://brand.com/page" rel="nofollow sponsored">Brand</a></body></html>`;
    const result = inspectBacklinkHtml(
      html,
      { targetUrl: 'https://brand.com/page', expectedAnchor: 'Brand' },
      200,
      'https://publisher.com/post'
    );
    expect(result.targetFound).toBe(true);
    expect(result.anchorMatched).toBe(true);
    expect(result.isNofollow).toBe(true);
    expect(result.outcome).toBe('verified');
  });
});

describe('submission estimates', () => {
  it('returns heuristic review hours by type', () => {
    expect(estimateReviewHours('guest_post')).toBeGreaterThan(estimateReviewHours('directory'));
  });
});

describe('queue stages', () => {
  it('allows prepared to submitted', async () => {
    const { canTransitionQueueStage } = await import('../src/queue-stages.js');
    expect(canTransitionQueueStage('prepared', 'submitted')).toBe(true);
    expect(canTransitionQueueStage('verified', 'submitted')).toBe(false);
  });
});

describe('content pack', () => {
  it('builds guest post pack with V1.1 generation gates', () => {
    const pack = generateGuestPostPack(
      { title: 'SEO Tips', domain: 'moz.com', opportunity_type: 'guest_post', score: 70 },
      { brandName: 'Acme', projectDomain: 'acme.com', industry: 'marketing' }
    );
    expect(pack.seoTitle).toContain('Acme');
    expect(pack.schemaJsonLd['@type']).toBe('Article');
    expect(pack.generationStatus.images).toBe('v1.1_provider_required');
  });
});

describe('browser execution planner', () => {
  it('detects gates and never marks captcha as auto-solvable', async () => {
    const { detectFormIntelligence, buildExecutionPlan, gateStatusFromBlocker, redactFormValues } =
      await import('../src/browser-execution.js');
    const form = detectFormIntelligence(
      '<form><input name="title" required /><div class="g-recaptcha"></div><input type="password" /></form>'
    );
    expect(form.gates.captcha).toBe(true);
    expect(form.gates.login).toBe(true);
    const plan = buildExecutionPlan({
      url: 'https://example.com/submit',
      opportunityType: 'directory',
      form,
      requireApproval: true,
    });
    expect(plan.some((s) => s.blocker === 'captcha')).toBe(true);
    expect(plan.some((s) => s.blocker === 'human_approval')).toBe(true);
    expect(gateStatusFromBlocker('captcha')).toBe('blocked_captcha');
    expect(redactFormValues({ password: 'secret', title: 'ok' }).password).toBe('[REDACTED]');
  });
});
