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

  it('marks paid when form has only paid plan radios', () => {
    const html = `
      <form id="submit">
        <div class="pricing">
          <label><input type="radio" name="LINK_TYPE" /> Premium Listing $49</label>
          <label><input type="radio" name="LINK_TYPE" /> Featured Plan</label>
        </div>
        <input name="URL" /><textarea name="DESCRIPTION"></textarea>
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks paid when free submissions are disabled (false free word)', () => {
    const html = `
      <form>
        <p>A premium token is required to submit listings. Free submissions are currently disabled.</p>
        <label>Premium Listing Token *</label>
        <input name="premium_token" placeholder="Enter your premium token (required)" required />
        <input name="URL" /><textarea name="DESCRIPTION"></textarea>
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks paid when free submissions are temporarily disabled with $ options only', () => {
    const html = `
      <p style="color:red">Free Submissions are Temporarily disabled until the big review queue of 246,000+ pending free submissions are reviewed. There is no point in accepting free submissions until the queue is clear.</p>
      <form>
        <p>Pricing:</p>
        <label><input type="radio" name="LINK_TYPE" /> Featured Express Reviews: $6</label>
        <label><input type="radio" name="LINK_TYPE" /> Fast Reviews: $3</label>
        <label><input type="radio" name="LINK_TYPE" /> Featured Listing + 49 Approved Listings: $30</label>
        <input name="URL" /><textarea name="DESCRIPTION"></textarea>
      </form>`;
    expect(classifyListingPricingFromHtml(html)).toBe('paid');
  });

  it('marks paid when pricing radios are all dollar amounts (no free option)', () => {
    const html = `
      <form>
        <div>Pricing:</div>
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

  it('marks FREE directory form free even when sidebar ads show $0.80 / $0.50', () => {
    const html = `
      <h1>FREE & INSTANT DIRECTORY LIST</h1>
      <a>Looking for Premium Featured Links at Very Low Prices</a>
      <aside>
        <h3>Sponsored Links</h3>
        <a>Your Link Here for $0.80</a>
        <a>Your Link Here for $0.80</a>
        <div>PUT YOUR 468X60 BANNER HERE only $0.50/directory 50 directories</div>
      </aside>
      <form method="post">
        <p>Link submitted and awaiting approval. Submit another link.</p>
        <label>Title *</label><input name="TITLE" required />
        <label>URL *</label><input name="URL" required />
        <p>Attention: The links once placed in directory will be active for at least one year</p>
        <label>Description</label><textarea name="DESCRIPTION"></textarea>
        <label>Your Name *</label><input name="OWNER_NAME" required />
        <label>Your Email *</label><input name="OWNER_EMAIL" required />
        <label>Category</label>
        <select name="CATEGORY_ID"><option>[Top]</option><option>Business</option></select>
        <input type="submit" value="Continue" />
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
        html: '<form><input name="TITLE" /><label>Free Listing</label></form>',
        wizardWalkStatus: 'paid_only',
      })
    ).toBe('paid');
  });
});
