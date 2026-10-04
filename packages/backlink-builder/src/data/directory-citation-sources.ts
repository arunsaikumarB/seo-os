/**
 * Free directory and citation submission pages.
 *
 * Each URL was fetched directly (HTTP 200, final URL unchanged, a real <form>
 * on a page titled as a submit/add flow). Checked 2026-10-04 from this repo's
 * audit environment. These are not live authority metrics and not a crawl.
 *
 * Popular citation hosts that returned Cloudflare challenges, login walls, or
 * unrelated redirects (Yelp, Hotfrog, Brownbook, Cybo, Manta, Yellow Pages,
 * Google Business, and similar) are omitted on purpose. Guessing their submit
 * paths would send the worker at pages we have not seen.
 */

export type CuratedSubmissionKind = 'directory' | 'citation';

export interface CuratedSubmissionSource {
  domain: string;
  /** Actual submission page, not the site homepage. */
  url: string;
  title: string;
  kind: CuratedSubmissionKind;
}

export const DIRECTORY_CITATION_SOURCES: readonly CuratedSubmissionSource[] = [
  {
    domain: 'jayde.com',
    url: 'https://www.jayde.com/submit.html',
    title: 'Jayde — Submit your site',
    kind: 'directory',
  },
  {
    domain: 'exactseek.com',
    url: 'https://www.exactseek.com/add.html',
    title: 'ExactSeek — Add Your URL',
    kind: 'directory',
  },
  {
    domain: 'gainweb.org',
    url: 'https://gainweb.org/submit.php',
    title: 'Gain Web — Submit Links',
    kind: 'directory',
  },
  {
    domain: 'prolinkdirectory.com',
    url: 'https://www.prolinkdirectory.com/submit.php',
    title: 'ProLinkDirectory — Submit Link',
    kind: 'directory',
  },
  {
    domain: 'sitepromotiondirectory.com',
    url: 'https://www.sitepromotiondirectory.com/submit.php',
    title: 'Site Promotion Directory — Submit Link',
    kind: 'directory',
  },
  {
    domain: 'highrankdirectory.com',
    url: 'https://www.highrankdirectory.com/submit.php',
    title: 'High Rank Directory — Submit Link',
    kind: 'directory',
  },
  {
    domain: 'n49.com',
    url: 'https://www.n49.com/add-business',
    title: 'n49 — Add your Business',
    kind: 'citation',
  },
  {
    domain: 'cylex.us.com',
    url: 'https://www.cylex.us.com/add-company.html',
    title: 'Cylex — Add Company',
    kind: 'citation',
  },
] as const;
