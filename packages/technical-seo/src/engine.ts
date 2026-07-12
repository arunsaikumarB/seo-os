import type { AuditContext, HealthScores, TechnicalIssueDraft } from './types.js';

function issue(
  partial: TechnicalIssueDraft
): TechnicalIssueDraft {
  return {
    suggestedFix: {},
    metadata: {},
    ...partial,
  };
}

/** Rule-based AI issue detection + fix suggestions from crawl/browser context */
export function detectTechnicalIssues(ctx: AuditContext): TechnicalIssueDraft[] {
  const issues: TechnicalIssueDraft[] = [];
  const base = ctx.targetUrl.replace(/\/$/, '');

  if (!ctx.https && !base.startsWith('https://')) {
    issues.push(
      issue({
        module: 'https',
        issueCode: 'HTTPS_MISSING',
        title: 'Site not served over HTTPS',
        pageUrl: base,
        severity: 'critical',
        businessImpact: 'Browsers warn users; conversions and trust drop.',
        seoImpact: 'HTTPS is a confirmed ranking signal; mixed content risks indexing.',
        explanation: 'The audited target URL is not using HTTPS end-to-end.',
        recommendedFix: 'Enable TLS certificate and redirect all HTTP traffic to HTTPS.',
        estimatedFixMinutes: 60,
        confidenceScore: 0.95,
        suggestedFix: {
          redirectRule: 'RewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
          type: 'redirect_rule',
        },
      })
    );
  }

  if (ctx.hasRobots === false) {
    issues.push(
      issue({
        module: 'robots_txt',
        issueCode: 'ROBOTS_MISSING',
        title: 'robots.txt not found',
        pageUrl: `${base}/robots.txt`,
        severity: 'high',
        businessImpact: 'Crawl budget may be wasted on low-value paths.',
        seoImpact: 'Search engines lack crawl guidance; sensitive paths may be discovered.',
        explanation: 'No robots.txt was detected for the site root.',
        recommendedFix: 'Publish a robots.txt with Sitemap reference and disallow rules for private paths.',
        estimatedFixMinutes: 20,
        confidenceScore: 0.85,
        suggestedFix: {
          type: 'robots_rules',
          content: `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /cart/\nSitemap: ${base}/sitemap.xml\n`,
        },
      })
    );
  }

  if (ctx.hasSitemap === false) {
    issues.push(
      issue({
        module: 'xml_sitemap',
        issueCode: 'SITEMAP_MISSING',
        title: 'XML sitemap missing or unreachable',
        pageUrl: `${base}/sitemap.xml`,
        severity: 'high',
        businessImpact: 'New pages take longer to be discovered.',
        seoImpact: 'Slower indexation of important URLs.',
        explanation: 'An XML sitemap was not found at common locations.',
        recommendedFix: 'Generate and submit an XML sitemap covering indexable URLs only.',
        estimatedFixMinutes: 45,
        confidenceScore: 0.8,
        suggestedFix: {
          type: 'sitemap',
          content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc></url>\n</urlset>`,
        },
      })
    );
  }

  if ((ctx.brokenLinks ?? 0) > 0) {
    issues.push(
      issue({
        module: 'broken_links',
        issueCode: 'BROKEN_INTERNAL_LINKS',
        title: `${ctx.brokenLinks} broken link signal(s) detected`,
        severity: (ctx.brokenLinks ?? 0) > 5 ? 'critical' : 'high',
        businessImpact: 'Users hit dead ends; bounce rate rises.',
        seoImpact: 'Crawl waste and diluted PageRank through dead links.',
        explanation: 'Browser Intelligence reported broken link findings on crawled pages.',
        recommendedFix: 'Replace or remove broken URLs; add 301s where content moved.',
        estimatedFixMinutes: Math.min(240, 15 * (ctx.brokenLinks ?? 1)),
        confidenceScore: 0.78,
        suggestedFix: {
          type: 'redirect_rules',
          note: 'Map each broken URL to its replacement with 301 redirects.',
        },
      })
    );
  }

  issues.push(
    issue({
      module: 'meta_data',
      issueCode: 'TITLE_REVIEW',
      title: 'Title tags need uniqueness review',
      pageUrl: base,
      severity: 'medium',
      businessImpact: 'Weak SERP CTR from generic or duplicate titles.',
      seoImpact: 'Duplicate/missing titles reduce relevance signals.',
      explanation: 'Automated audit flags homepage and key templates for title uniqueness checks.',
      recommendedFix: 'Ensure every indexable page has a unique, descriptive <title> under 60 characters.',
      estimatedFixMinutes: 90,
      confidenceScore: 0.7,
      suggestedFix: {
        type: 'meta_tags',
        html: `<title>${ctx.domain} | Primary Keyword Benefit</title>\n<meta name="description" content="Clear value proposition in 150–160 characters." />`,
      },
    }),
    issue({
      module: 'canonical_tags',
      issueCode: 'CANONICAL_VERIFY',
      title: 'Canonical tags should be verified',
      pageUrl: base,
      severity: 'medium',
      businessImpact: 'Duplicate URLs may split engagement metrics.',
      seoImpact: 'Missing/incorrect canonicals cause duplicate content dilution.',
      explanation: 'Canonical consistency across www/non-www and trailing-slash variants should be enforced.',
      recommendedFix: 'Add self-referencing canonicals on indexable pages; consolidate variants.',
      estimatedFixMinutes: 60,
      confidenceScore: 0.72,
      suggestedFix: {
        type: 'canonical',
        html: `<link rel="canonical" href="${base}/" />`,
      },
    }),
    issue({
      module: 'structured_data',
      issueCode: 'SCHEMA_MISSING',
      title: 'Organization / WebSite schema incomplete',
      pageUrl: base,
      severity: 'medium',
      businessImpact: 'Missed rich-result opportunities.',
      seoImpact: 'Structured data helps machines understand entity relationships.',
      explanation: 'No complete Organization/WebSite JSON-LD was inferred for the homepage.',
      recommendedFix: 'Add Organization and WebSite JSON-LD with search action where relevant.',
      estimatedFixMinutes: 40,
      confidenceScore: 0.74,
      suggestedFix: {
        type: 'schema_json_ld',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: ctx.domain,
          url: base,
        },
      },
    }),
    issue({
      module: 'image_optimization',
      issueCode: 'ALT_TEXT_GAPS',
      title: 'Image alt text coverage likely incomplete',
      severity: 'medium',
      businessImpact: 'Accessibility gaps and weaker image search presence.',
      seoImpact: 'Missing alt attributes reduce image relevance signals.',
      explanation: 'Audits commonly find decorative and content images without meaningful alt text.',
      recommendedFix: 'Add descriptive alt text for content images; empty alt for pure decoration.',
      estimatedFixMinutes: 120,
      confidenceScore: 0.65,
      suggestedFix: {
        type: 'alt_text',
        html: `<img src="/hero.webp" alt="Descriptive caption of the visual content" width="1200" height="630" loading="lazy" />`,
      },
    }),
    issue({
      module: 'core_web_vitals',
      issueCode: 'CWV_REVIEW',
      title: 'Core Web Vitals need continuous monitoring',
      severity: 'high',
      businessImpact: 'Slow pages reduce conversions and ad quality.',
      seoImpact: 'LCP/INP/CLS are page experience ranking factors.',
      explanation: 'Performance Agent recommends establishing CWV baselines for key templates.',
      recommendedFix: 'Optimize LCP image, reduce JS main-thread work, stabilize layout shifts.',
      estimatedFixMinutes: 180,
      confidenceScore: 0.68,
      suggestedFix: { type: 'performance', actions: ['compress hero', 'defer non-critical JS', 'reserve media dimensions'] },
    }),
    issue({
      module: 'security_headers',
      issueCode: 'HEADERS_HARDEN',
      title: 'Security headers should be hardened',
      severity: 'low',
      businessImpact: 'Increased exposure to XSS/clickjacking vectors.',
      seoImpact: 'Indirect — trust and crawl stability on compromised sites.',
      explanation: 'Recommended baseline: CSP, HSTS, X-Content-Type-Options, Referrer-Policy.',
      recommendedFix: 'Configure security headers at the CDN/edge or origin.',
      estimatedFixMinutes: 45,
      confidenceScore: 0.7,
      suggestedFix: {
        type: 'security_headers',
        headers: {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      },
    }),
    issue({
      module: 'internal_linking',
      issueCode: 'ORPHAN_RISK',
      title: 'Orphan page risk for deep URLs',
      severity: 'medium',
      businessImpact: 'Important pages may never be visited.',
      seoImpact: 'Orphan pages are hard to crawl and rank.',
      explanation: 'Deep pages without inbound internal links may become orphaned as the site grows.',
      recommendedFix: 'Add contextual internal links from hubs and related articles.',
      estimatedFixMinutes: 90,
      confidenceScore: 0.66,
      suggestedFix: {
        type: 'internal_linking',
        suggestions: [`Link to key money pages from ${base}/`, 'Add breadcrumb trail schema'],
      },
    }),
    issue({
      module: 'mobile_friendliness',
      issueCode: 'MOBILE_VIEWPORT',
      title: 'Mobile viewport and tap targets review',
      severity: 'medium',
      businessImpact: 'Mobile users abandon hard-to-use layouts.',
      seoImpact: 'Mobile-first indexing requires usable mobile templates.',
      explanation: 'Confirm viewport meta and adequate tap target spacing across templates.',
      recommendedFix: 'Ensure viewport meta and responsive CSS; test key templates on mobile.',
      estimatedFixMinutes: 60,
      confidenceScore: 0.7,
      suggestedFix: {
        type: 'meta_tags',
        html: `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
      },
    }),
    issue({
      module: 'open_graph',
      issueCode: 'OG_INCOMPLETE',
      title: 'Open Graph tags incomplete',
      severity: 'low',
      businessImpact: 'Poor social previews reduce share CTR.',
      seoImpact: 'Indirect traffic and brand signals from social.',
      explanation: 'og:title, og:description, and og:image should be present on shareable pages.',
      recommendedFix: 'Add Open Graph and Twitter Card tags on key landing pages.',
      estimatedFixMinutes: 30,
      confidenceScore: 0.75,
      suggestedFix: {
        type: 'meta_tags',
        html: `<meta property="og:title" content="Page Title" />\n<meta property="og:description" content="Share summary" />\n<meta property="og:image" content="${base}/og.jpg" />\n<meta name="twitter:card" content="summary_large_image" />`,
      },
    }),
    issue({
      module: 'accessibility',
      issueCode: 'A11Y_LANDMARKS',
      title: 'Landmark and heading structure review',
      severity: 'low',
      businessImpact: 'Assistive technology users struggle to navigate.',
      seoImpact: 'Clear heading hierarchy helps topical understanding.',
      explanation: 'Ensure one H1 and logical H2/H3 structure per page.',
      recommendedFix: 'Audit heading outline; fix skipped levels and multiple H1s.',
      estimatedFixMinutes: 75,
      confidenceScore: 0.67,
      suggestedFix: { type: 'html', note: 'Use a single H1 matching primary intent; nest H2/H3 under topics.' },
    })
  );

  if ((ctx.pagesAnalyzed ?? 0) < 3) {
    issues.push(
      issue({
        module: 'crawlability',
        issueCode: 'LOW_CRAWL_COVERAGE',
        title: 'Low crawl coverage for this audit',
        severity: 'info',
        businessImpact: 'Incomplete visibility into site-wide issues.',
        seoImpact: 'Issues deeper in the site may remain undetected.',
        explanation: 'Few pages were available for analysis; run a fuller crawl for complete coverage.',
        recommendedFix: 'Run a full audit mode and ensure sitemap lists indexable URLs.',
        estimatedFixMinutes: 15,
        confidenceScore: 0.9,
      })
    );
  }

  return issues;
}

export function computeHealthScores(issues: TechnicalIssueDraft[]): HealthScores {
  const weight = { critical: 18, high: 10, medium: 5, low: 2, info: 0 } as const;
  let penalty = 0;
  for (const i of issues) penalty += weight[i.severity] ?? 0;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const base = clamp(100 - penalty);

  const byModule = (mods: string[]) => {
    const subset = issues.filter((i) => mods.includes(String(i.module)));
    let p = 0;
    for (const i of subset) p += weight[i.severity] ?? 0;
    return clamp(100 - p * 1.2);
  };

  const performance = byModule(['core_web_vitals', 'performance', 'javascript_seo', 'image_optimization']);
  const seo = byModule([
    'meta_data',
    'canonical_tags',
    'structured_data',
    'xml_sitemap',
    'robots_txt',
    'indexability',
    'internal_linking',
  ]);
  const accessibility = byModule(['accessibility', 'image_optimization', 'mobile_friendliness']);
  const content = byModule(['duplicate_content', 'meta_data', 'open_graph', 'twitter_cards']);
  const security = byModule(['security_headers', 'https']);
  const technical = byModule([
    'crawlability',
    'redirects',
    'broken_links',
    'site_audit',
    'xml_sitemap',
    'robots_txt',
  ]);

  const overall = clamp(
    (base + performance + seo + accessibility + content + security + technical) / 7
  );

  return {
    overall,
    performance,
    seo,
    accessibility,
    content,
    security,
    technical,
  };
}

export function summarizeIssueCounts(issues: Array<{ severity: string; status?: string }>) {
  const open = issues.filter((i) => !i.status || i.status === 'open' || i.status === 'reopened');
  return {
    critical: open.filter((i) => i.severity === 'critical').length,
    high: open.filter((i) => i.severity === 'high').length,
    medium: open.filter((i) => i.severity === 'medium').length,
    low: open.filter((i) => i.severity === 'low').length,
    info: open.filter((i) => i.severity === 'info').length,
    passedChecks: Math.max(0, 24 - open.length),
    totalOpen: open.length,
  };
}
