import { describe, expect, it } from 'vitest';
import {
  assertProjectOwnership,
  brandsMatch,
  buildProjectContentContext,
  findForeignBrandContamination,
  isArticleLikePlatform,
  resolveSubmissionPlatformType,
  validateProjectContentIsolation,
  ProjectMismatchError,
} from './project-content-isolation.js';
import {
  isSeoKeywordBankAllowedForBrand,
  pickKeywordsForOpportunity,
  pickTitleDescriptionBlock,
  SEO_KEYWORD_BANK,
} from './seo-keyword-bank.js';

describe('project content isolation (P0)', () => {
  it('detects ChefGaa markers when project brand is Desi Dhamaka', () => {
    const title = 'Restaurant Point of Sale POS Software | ChefGaa · Alistdirectory';
    const hits = findForeignBrandContamination(title, 'Desi Dhamaka');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /chefgaa/i.test(h))).toBe(true);
  });

  it('does not flag ChefGaa when brand is ChefGaa', () => {
    const hits = findForeignBrandContamination(
      'Restaurant Point of Sale POS Software | ChefGaa',
      'ChefGaa'
    );
    expect(hits).toEqual([]);
  });

  it('blocks SEO bank for non-ChefGaa projects', () => {
    expect(isSeoKeywordBankAllowedForBrand('Desi Dhamaka')).toBe(false);
    expect(pickTitleDescriptionBlock('seed-1', { brandName: 'Desi Dhamaka' })).toBeNull();
    expect(pickKeywordsForOpportunity('seed-1', { brandName: 'Desi Dhamaka' })).toBe('');
  });

  it('allows SEO bank only for ChefGaa brand', () => {
    expect(isSeoKeywordBankAllowedForBrand('ChefGaa')).toBe(true);
    expect(brandsMatch(SEO_KEYWORD_BANK.brand, 'Chefgaa')).toBe(true);
    const block = pickTitleDescriptionBlock('chefgaa-directory-1', { brandName: 'ChefGaa' });
    expect(block?.title || block?.h1).toBeTruthy();
    const kws = pickKeywordsForOpportunity('chefgaa-directory-1', { brandName: 'ChefGaa' });
    expect(kws.length).toBeGreaterThan(10);
  });

  it('legacy bank pick without brandName returns empty (no silent ChefGaa leak)', () => {
    expect(pickTitleDescriptionBlock('any-seed')).toBeNull();
    expect(pickKeywordsForOpportunity('any-seed')).toBe('');
  });

  it('assertProjectOwnership throws on mismatch', () => {
    expect(() => assertProjectOwnership('proj-a', 'proj-b')).toThrow(ProjectMismatchError);
    expect(() => assertProjectOwnership('proj-a', 'proj-a')).not.toThrow();
  });

  it('validateProjectContentIsolation catches mixed Desi/Chefgaa package', () => {
    const result = validateProjectContentIsolation({
      currentProjectId: 'desi-id',
      packageProjectId: 'desi-id',
      businessName: 'DesiDhamaka',
      expectedBusinessName: 'Desi Dhamaka',
      title: 'Restaurant Point of Sale POS Software | ChefGaa · Alistdirectory',
      description: 'Desi Dhamaka content',
    });
    expect(result.ok).toBe(false);
    expect(result.foreignMarkers.length).toBeGreaterThan(0);
  });

  it('buildProjectContentContext refuses empty brand', () => {
    expect(() =>
      buildProjectContentContext({ projectId: 'p1', businessName: '' })
    ).toThrow(/no business\/brand name/i);
  });

  it('resolves Web 2.0 / article platform types', () => {
    expect(
      resolveSubmissionPlatformType({
        classificationId: 'article_submission',
        storageType: 'guest_post',
      })
    ).toBe('ARTICLE');
    expect(
      resolveSubmissionPlatformType({
        domain: 'medium.com',
        url: 'https://medium.com/new-story',
      })
    ).toBe('WEB_2_0');
    expect(isArticleLikePlatform('WEB_2_0')).toBe(true);
    expect(isArticleLikePlatform('DIRECTORY')).toBe(false);
  });
});
