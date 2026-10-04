import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BACKLINK_TYPES } from './backlink-types.js';
import { CATEGORY_WORKFLOWS, resolveExecutionMode, unavailableAiDraftMessage, workflowFor } from './category-workflows.js';
import { parseCommonCrawlCdx, parseDuckDuckGoHtml, sitemapLocs } from './free-search.js';

describe('category workflows', () => {
  it('covers every backlink type with a real mode and no invented metrics', () => {
    expect(CATEGORY_WORKFLOWS).toHaveLength(BACKLINK_TYPES.length);
    for (const type of BACKLINK_TYPES) {
      const workflow = workflowFor(type.id);
      expect(workflow, type.id).toBeTruthy();
      expect(['automatic', 'assisted', 'outreach']).toContain(workflow?.mode);
      expect(workflow?.footprints.length).toBeGreaterThan(0);
      expect(JSON.stringify(workflow)).not.toMatch(/"metricsSource":"live"/);
    }
    expect(workflowFor('directory')?.curated.length).toBeGreaterThan(0);
    expect(workflowFor('guest_post')?.curated).toEqual([]);
    expect(workflowFor('press_release')?.mode).toBe('outreach');
  });

  it('stops a broken URL and does not auto-submit a login wall', () => {
    expect(resolveExecutionMode('directory', {
      broken: true,
      captcha: false,
      cloudflare: false,
      loginRequired: false,
      noForm: true,
      submissionFormIndex: null,
      contactEmails: [],
    }).mode).toBe('stop');
    expect(resolveExecutionMode('directory', {
      broken: false,
      captcha: false,
      cloudflare: false,
      loginRequired: true,
      noForm: false,
      submissionFormIndex: null,
      contactEmails: [],
    }).mode).toBe('assisted');
  });

  it('says when no AI provider can write the draft', () => {
    expect(unavailableAiDraftMessage('guest post')).toMatch(/not generated/);
    expect(unavailableAiDraftMessage('guest post')).toMatch(/will not present a template/);
  });

  it('is listed in the truth table', () => {
    const doc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../docs/BACKLINK_CATEGORIES.md'),
      'utf8'
    );
    for (const type of BACKLINK_TYPES) {
      expect(doc).toContain(`\`${type.id}\``);
    }
  });
});

describe('free search parsers', () => {
  it('reads DuckDuckGo, Common Crawl, and sitemap URLs that are actually present', () => {
    const ddg = parseDuckDuckGoHtml(
      '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fjayde.com%2Fsubmit.html&rut">Jayde</a>'
    );
    expect(ddg).toEqual([{ title: 'Jayde', url: 'https://jayde.com/submit.html' }]);
    expect(parseDuckDuckGoHtml('<p>no results</p>')).toEqual([]);
    expect(parseCommonCrawlCdx('{"url":"https://a.example/submit"}\n{"url":"https://b.example/"}\n')).toEqual([
      'https://a.example/submit',
      'https://b.example/',
    ]);
    expect(sitemapLocs('<urlset><url><loc>https://a.example/submit</loc></url></urlset>')).toEqual([
      'https://a.example/submit',
    ]);
  });
});
