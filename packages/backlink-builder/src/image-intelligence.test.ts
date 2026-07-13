import { describe, expect, it } from 'vitest';
import {
  IMAGE_TYPES,
  buildDomainStyleProfile,
  buildImageMetadata,
  buildImagePrompt,
  buildSubmissionPackage,
  scoreImageQuality,
} from '../src/image-intelligence.js';

describe('Image Intelligence domain', () => {
  it('covers required image types', () => {
    expect(IMAGE_TYPES).toContain('blog_hero');
    expect(IMAGE_TYPES).toContain('open_graph');
    expect(IMAGE_TYPES).toContain('directory_logo');
    expect(IMAGE_TYPES.length).toBeGreaterThanOrEqual(20);
  });

  it('builds a reusable domain style profile', () => {
    const style = buildDomainStyleProfile({
      domain: 'acme.io',
      brandName: 'Acme',
      industry: 'saas',
      keywords: ['automation'],
    });
    expect(style.brandColors.length).toBeGreaterThan(0);
    expect(style.photographyStyle).toBeTruthy();
    expect(style.metricsSource).toBe('estimated');
  });

  it('auto-generates prompts without manual input', () => {
    const style = buildDomainStyleProfile({
      domain: 'bistro.example',
      brandName: 'Bistro',
      industry: 'restaurant',
    });
    const pack = buildImagePrompt({
      imageType: 'pinterest_pin',
      style,
      brandName: 'Bistro',
      topic: 'seasonal menu',
    });
    expect(pack.prompt.toLowerCase()).toContain('bistro');
    expect(pack.negativePrompt).toContain('watermark');
    expect(pack.recommendedProvider).toBe('flux');
    expect(pack.width).toBe(1000);
    expect(pack.height).toBe(1500);
  });

  it('rejects local draft SVG for Ready submissions', () => {
    const scores = scoreImageQuality({
      width: 1200,
      height: 630,
      mimeType: 'image/svg+xml',
      byteLength: 2000,
      imageType: 'blog_hero',
      hasMetadata: true,
      providerMode: 'local_draft_svg',
    });
    expect(scores.pass).toBe(false);
    expect(scores.rejectReason).toBeTruthy();
  });

  it('passes live raster with metadata', () => {
    const scores = scoreImageQuality({
      width: 1600,
      height: 900,
      mimeType: 'image/png',
      byteLength: 400_000,
      imageType: 'blog_hero',
      hasMetadata: true,
      providerMode: 'live',
    });
    expect(scores.pass).toBe(true);
    expect(scores.seoScore).toBeGreaterThanOrEqual(50);
  });

  it('builds SEO metadata and submission package', () => {
    const metadata = buildImageMetadata({
      brandName: 'Acme',
      imageType: 'open_graph',
      topic: 'product launch',
      width: 1200,
      height: 630,
    });
    expect(metadata.altText).toContain('Acme');
    expect(metadata.seoFilename).toMatch(/\.png$/);
    expect(metadata.ogMetadata['og:image:width']).toBe(1200);

    const pkg = buildSubmissionPackage({
      metadata,
      width: 1200,
      height: 630,
      mimeType: 'image/png',
      siteKey: 'pinterest',
    });
    expect(pkg.status).toBe('ready');
    expect(pkg.checklist.every((c) => c.done)).toBe(true);
  });
});
