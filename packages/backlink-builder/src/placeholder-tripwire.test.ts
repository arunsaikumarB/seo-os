import { describe, expect, it } from 'vitest';
import {
  findPlaceholderMarkers,
  scanPackForPlaceholders,
  PLACEHOLDER_MARKERS,
} from './placeholder-tripwire.js';

describe('placeholder-tripwire', () => {
  it('detects live Chefgaa template strings from §1', () => {
    const sample = `Marketinginternetdirectory: A Practical Guide from Our Brand
## Key Takeaways — Insight 1 tailored to the target audience · Data-backed perspective on industry trends · Actionable recommendations
sourceUrl: https://example.com
Our Brand — expert insights`;
    const hits = findPlaceholderMarkers(sample);
    expect(hits).toContain('Our Brand');
    expect(hits).toContain('Insight 1');
    expect(hits).toContain('example.com');
    expect(hits).toContain('A Practical Guide from');
    expect(hits).toContain('Key Takeaways');
  });

  it('detects empty-interpolation patterns', () => {
    expect(findPlaceholderMarkers('Hello {{brand}}')).toContain('{{');
  });

  it('passes clean brand content', () => {
    const pack = {
      seoTitle: 'Chefgaa Directory Listing for Food Brands',
      body: 'Chefgaa (go.chefgaa.com) helps restaurants grow with curated listings.',
      imageMetadata: [{ sourceUrl: 'https://go.chefgaa.com/logo.png' }],
    };
    expect(scanPackForPlaceholders(pack).ok).toBe(true);
  });

  it('exports the required marker set', () => {
    expect(PLACEHOLDER_MARKERS).toContain('Our Brand');
    expect(PLACEHOLDER_MARKERS).toContain('example.com');
  });
});
