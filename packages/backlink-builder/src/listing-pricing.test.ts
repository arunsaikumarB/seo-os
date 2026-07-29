import { describe, expect, it } from 'vitest';
import {
  classifyListingPricingFromHtml,
  resolveListingPricing,
} from './listing-pricing.js';

describe('classifyListingPricingFromHtml', () => {
  it('marks free when form contains the word free', () => {
    const html = `
      <form>
        <label><input type="radio" name="plan" /> Free Listing</label>
        <label><input type="radio" name="plan" /> Premium $29</label>
        <input name="url" />
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('free');
  });

  it('marks paid when form/payment has no free word', () => {
    const html = `
      <form id="submit">
        <div class="pricing">
          <label><input type="radio" /> Premium Listing $49</label>
          <label><input type="radio" /> Featured Plan</label>
        </div>
        <input name="url" />
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('returns unknown for empty / challenge-like pages without form signals', () => {
    expect(classifyListingPricingFromHtml('')).toBe('unknown');
    expect(classifyListingPricingFromHtml('<html><body>Just a blog post</body></html>')).toBe(
      'unknown'
    );
  });

  it('wizard paid_only overrides to paid', () => {
    expect(
      resolveListingPricing({
        html: '<form><label>Free</label></form>',
        wizardWalkStatus: 'paid_only',
      })
    ).toBe('paid');
  });
});
