import { describe, expect, it } from 'vitest';
import {
  classifyListingPricingFromHtml,
  resolveListingPricing,
} from './listing-pricing.js';

describe('classifyListingPricingFromHtml', () => {
  it('marks free when an active Free listing option exists', () => {
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

  it('marks paid when free submissions are disabled (false free word)', () => {
    const html = `
      <form>
        <p>A premium token is required to submit listings. Free submissions are currently disabled.</p>
        <label>Premium Listing Token *</label>
        <input name="premium_token" placeholder="Enter your premium token (required)" required />
        <input name="url" />
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks paid when free submissions are temporarily disabled with $ options only', () => {
    const html = `
      <div class="pricing">
        <p style="color:red">Free Submissions are Temporarily disabled until the big review queue of 246,000+ pending free submissions are reviewed. There is no point in accepting free submissions until the queue is clear.</p>
        <p>Pricing:</p>
        <label><input type="radio" name="p" /> Featured Express Reviews: $6</label>
        <label><input type="radio" name="p" /> Fast Reviews: $3</label>
        <label><input type="radio" name="p" /> Featured Listing + 49 Approved Listings: $30</label>
      </div>
      <form><input name="url" /><textarea name="description"></textarea></form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks paid when pricing radios are all dollar amounts (no free option)', () => {
    const html = `
      <div class="pricing">Pricing:</div>
      <form>
        <label><input type="radio" name="LINK_TYPE" checked /> featured listings (Max. exposure) $4.99</label>
        <label><input type="radio" name="LINK_TYPE" /> Regular listings $1.99</label>
        <input name="TITLE" /><input name="URL" /><textarea name="DESCRIPTION"></textarea>
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks free for Regular Reviews free option even if page advertises paid packages', () => {
    const html = `
      <p>only $2/directory 46 directories</p>
      <form>
        <label><input type="radio" name="LINK_TYPE" checked /> Regular Reviews free</label>
        <label><input type="radio" name="LINK_TYPE" /> Regular Reviews with reciprocal free</label>
        <input name="TITLE" /><input name="URL" />
        <textarea name="DESCRIPTION"></textarea>
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('free');
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
        html: '<form><label>Free Listing</label></form>',
        wizardWalkStatus: 'paid_only',
      })
    ).toBe('paid');
  });
});
