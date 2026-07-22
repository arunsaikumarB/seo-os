/**
 * Site fingerprint — cheap deterministic platform detection (Phase 5 §4).
 * Unknown is an honest answer; never force a guess.
 */
import type { DetectorSignal } from './detector-registry.js';

export const SITE_PLATFORMS = [
  'WordPress',
  'Ghost',
  'HubSpot',
  'Drupal',
  'Wix',
  'Webflow',
  'Google Forms',
  'Typeform',
  'Custom / Unknown',
] as const;

export type SitePlatform = (typeof SITE_PLATFORMS)[number];

export type SiteFingerprint = {
  platform: SitePlatform;
  confidence: number;
  signals: DetectorSignal[];
  /** Hints for crawler / detectors — never substitute for evidence */
  hints: {
    loginUrlPatterns: string[];
    submissionUrlPatterns: string[];
    formHints: string[];
  };
  /** Capability 1 — WordPressKnowledge when SIE enrichment ran */
  wordpress?: Record<string, unknown>;
};

type FpInput = {
  html: string;
  url: string;
  headers?: Record<string, string>;
};

function sig(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

const PLATFORM_RULES: Array<{
  platform: Exclude<SitePlatform, 'Custom / Unknown'>;
  test: (i: FpInput) => DetectorSignal[];
  hints: SiteFingerprint['hints'];
}> = [
  {
    platform: 'WordPress',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/wp-content|wp-includes|wp-json/i.test(i.html))
        s.push(sig('wp_assets', 'dom', 'wp-content/wp-includes'));
      if (/<meta[^>]+name=["']generator["'][^>]+wordpress/i.test(i.html))
        s.push(sig('wp_generator', 'dom', 'generator meta'));
      if (/\/wp-login\.php/i.test(i.html) || /\/wp-login\.php/i.test(i.url))
        s.push(sig('wp_login', 'url', 'wp-login.php'));
      return s;
    },
    hints: {
      loginUrlPatterns: ['/wp-login.php', '/wp-admin'],
      submissionUrlPatterns: ['/write-for-us', '/guest-post', '/submit'],
      formHints: ['wordpress_comment', 'contact_form_7'],
    },
  },
  {
    platform: 'Ghost',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/ghost\.org|content=["']Ghost/i.test(i.html) || /\/ghost\//i.test(i.html))
        s.push(sig('ghost', 'dom', 'Ghost markers'));
      return s;
    },
    hints: {
      loginUrlPatterns: ['/ghost/#/signin'],
      submissionUrlPatterns: [],
      formHints: ['ghost_portal'],
    },
  },
  {
    platform: 'HubSpot',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/hs-scripts|hubspot|hsforms/i.test(i.html)) s.push(sig('hubspot', 'dom', 'HubSpot'));
      return s;
    },
    hints: {
      loginUrlPatterns: [],
      submissionUrlPatterns: [],
      formHints: ['hsform'],
    },
  },
  {
    platform: 'Drupal',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/drupal\.settings|sites\/default\/files|Drupal\.settings/i.test(i.html))
        s.push(sig('drupal', 'dom', 'Drupal'));
      if (/<meta[^>]+content=["']Drupal/i.test(i.html)) s.push(sig('drupal_meta', 'dom', 'meta'));
      return s;
    },
    hints: {
      loginUrlPatterns: ['/user/login'],
      submissionUrlPatterns: [],
      formHints: [],
    },
  },
  {
    platform: 'Wix',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/wix\.com|wixstatic|_wix_browser_sess/i.test(i.html)) s.push(sig('wix', 'dom', 'Wix'));
      return s;
    },
    hints: {
      loginUrlPatterns: [],
      submissionUrlPatterns: [],
      formHints: ['wix_forms'],
    },
  },
  {
    platform: 'Webflow',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/webflow\.com|w-mod-|data-wf-page/i.test(i.html))
        s.push(sig('webflow', 'dom', 'Webflow'));
      return s;
    },
    hints: {
      loginUrlPatterns: [],
      submissionUrlPatterns: [],
      formHints: ['webflow_form'],
    },
  },
  {
    platform: 'Google Forms',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/docs\.google\.com\/forms|forms\.gle/i.test(i.url + i.html))
        s.push(sig('gforms', 'url', 'Google Forms'));
      return s;
    },
    hints: {
      loginUrlPatterns: [],
      submissionUrlPatterns: [],
      formHints: ['google_form'],
    },
  },
  {
    platform: 'Typeform',
    test: (i) => {
      const s: DetectorSignal[] = [];
      if (/typeform\.com|data-tf-/i.test(i.url + i.html))
        s.push(sig('typeform', 'url', 'Typeform'));
      return s;
    },
    hints: {
      loginUrlPatterns: [],
      submissionUrlPatterns: [],
      formHints: ['typeform'],
    },
  },
];

export function fingerprintSite(input: FpInput): SiteFingerprint {
  let best: { platform: SitePlatform; signals: DetectorSignal[]; hints: SiteFingerprint['hints'] } | null =
    null;
  for (const rule of PLATFORM_RULES) {
    const signals = rule.test(input);
    if (signals.length === 0) continue;
    if (!best || signals.length > best.signals.length) {
      best = { platform: rule.platform, signals, hints: rule.hints };
    }
  }
  if (!best) {
    return {
      platform: 'Custom / Unknown',
      confidence: 0,
      signals: [],
      hints: { loginUrlPatterns: [], submissionUrlPatterns: [], formHints: [] },
    };
  }
  return {
    platform: best.platform,
    confidence: Math.min(0.98, 0.55 + best.signals.length * 0.15),
    signals: best.signals,
    hints: best.hints,
  };
}
