import { describe, expect, it } from 'vitest';
import {
  FURTHER_COMPANY_INFO_MAX,
  fitFurtherCompanyInfo,
  pickKeywordsForOpportunity,
  pickTitleDescriptionBlock,
  SEO_KEYWORD_BANK,
} from './seo-keyword-bank.js';
import { isSearchOrNavField, valueForRole } from './assisted-manual.js';

describe('seo-keyword-bank', () => {
  it('loads KW1 / KW2 / title-description blocks from the expert sheet', () => {
    expect(SEO_KEYWORD_BANK.kw1.length).toBeGreaterThan(50);
    expect(SEO_KEYWORD_BANK.kw2.length).toBeGreaterThan(20);
    expect(SEO_KEYWORD_BANK.titleDescriptionBlocks.length).toBeGreaterThan(10);
  });

  it('picks stable unique keywords per opportunity seed', () => {
    const a = pickKeywordsForOpportunity('site-a.example', { brandName: 'ChefGaa' });
    const b = pickKeywordsForOpportunity('site-b.example', { brandName: 'ChefGaa' });
    expect(a.length).toBeGreaterThan(10);
    expect(a).toMatch(/,/);
    expect(a === b).toBe(false);
  });

  it('picks a title/description block', () => {
    const block = pickTitleDescriptionBlock('chefgaa-directory-1', { brandName: 'ChefGaa' });
    expect(block?.title || block?.h1).toBeTruthy();
  });

  it('refuses bank seeds for other brands', () => {
    expect(pickTitleDescriptionBlock('x', { brandName: 'Desi Dhamaka' })).toBeNull();
    expect(pickKeywordsForOpportunity('x', { brandName: 'Desi Dhamaka' })).toBe('');
  });

  it('caps further company info at 1500', () => {
    const long = 'Word '.repeat(400);
    const fitted = fitFurtherCompanyInfo(long);
    expect(fitted.value.length).toBeLessThanOrEqual(FURTHER_COMPANY_INFO_MAX);
    expect(fitted.overLimit).toBe(true);
  });
});

describe('keywords field mapping', () => {
  it('does not treat listing Keywords as site search', () => {
    expect(
      isSearchOrNavField({
        type: 'text',
        name: 'KEYWORDS',
        id: 'keywords',
        label: 'Keywords',
        ariaLabel: null,
        placeholder: null,
        surroundingText: null,
        required: false,
        maxlength: 255,
        options: [],
        accept: null,
        sizeHint: null,
        selector: '#keywords',
      })
    ).toBe(false);
  });

  it('fills keywords / further_info / article roles from content', () => {
    const content = {
      keywords: 'restaurant pos, billing software',
      furtherCompanyInfo: 'A'.repeat(800),
      articleBody: 'Full article about ChefGaa POS.',
      longDescription: 'Short long desc.',
    };
    expect(valueForRole('keywords', content)).toContain('restaurant pos');
    expect(valueForRole('further_info', content).length).toBe(800);
    expect(valueForRole('article', content)).toContain('Full article');
  });
});
