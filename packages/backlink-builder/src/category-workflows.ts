/**
 * Honest workflow for every BACKLINK_TYPES id.
 * Curated URLs are only pages that were fetched and had a real form.
 * Footprints are search queries, not opportunities, until a scan says otherwise.
 * Metrics are never filled in here.
 */

import type { BacklinkTypeId } from './backlink-types.js';
import { DIRECTORY_CITATION_SOURCES } from './data/directory-citation-sources.js';
import type { UrlScanVerdict } from './url-scanner.js';

export type WorkflowMode = 'automatic' | 'assisted' | 'outreach';

export interface CuratedSubmitUrl {
  domain: string;
  url: string;
  title: string;
}

export interface CategoryWorkflow {
  id: BacklinkTypeId;
  /** Typical path. The scanner can narrow it for a specific URL. */
  mode: WorkflowMode;
  summary: string;
  humanStep: string | null;
  footprints: string[];
  curated: CuratedSubmitUrl[];
  freeSources: string[];
}

const directoryCurated = DIRECTORY_CITATION_SOURCES.filter((s) => s.kind === 'directory').map(
  ({ domain, url, title }) => ({ domain, url, title })
);
const citationCurated = DIRECTORY_CITATION_SOURCES.filter((s) => s.kind === 'citation').map(
  ({ domain, url, title }) => ({ domain, url, title })
);

function row(
  id: BacklinkTypeId,
  mode: WorkflowMode,
  summary: string,
  humanStep: string | null,
  footprints: string[],
  curated: CuratedSubmitUrl[] = []
): CategoryWorkflow {
  return {
    id,
    mode,
    summary,
    humanStep,
    footprints,
    curated,
    freeSources: [
      'Curated submission URLs in the repo, when listed',
      'DuckDuckGo HTML search of the footprint queries',
      'Common Crawl CDX index when the public index responds',
      'The site\'s own sitemap.xml when it is public',
      'URL scanner (HTTP, then Playwright if the page is a JS shell)',
    ],
  };
}

export const CATEGORY_WORKFLOWS: readonly CategoryWorkflow[] = [
  row('guest_post', 'outreach', 'Find a real editor or write-for-us page, draft with AI only when a provider is configured, send from the user\'s mailbox, then verify the live URL.', 'Person approves the email and confirms the published URL.', ['"write for us"', '"guest post guidelines"', 'inurl:write-for-us']),
  row('press_release', 'outreach', 'There is no free press-wire API in this app. Find a real editor or a free submission page the scanner confirms.', 'Person sends the release or pastes the published URL.', ['"press release" "submit"', '"media contact"']),
  row('pdf', 'outreach', 'A PDF link is outreach unless the scanner finds a real upload form.', 'Person uploads the file or emails the host.', ['"submit a pdf"', 'inurl:resources filetype:pdf']),
  row('video', 'assisted', 'Video hosts need an account. The app does not upload or publish a video by itself.', 'Person uploads the video and pastes the public URL.', ['"submit a video"', 'site:youtube.com/channel']),
  row('infographic', 'outreach', 'Infographic placements are outreach unless a scan finds an embed or upload form.', 'Person sends the asset and confirms the page.', ['"infographic" "submit"', '"embed this infographic"']),
  row('web2', 'assisted', 'Web 2.0 properties require an account. The app prepares the draft and a person publishes it.', 'Person creates the account, publishes, and pastes the URL.', ['"create a free blog"', 'inurl:signup blog']),
  row('case_study', 'outreach', 'Case studies are pitched to a real editor.', 'Person approves and sends the pitch.', ['"submit a case study"', '"customer story" "write for us"']),
  row('whitepaper', 'outreach', 'Whitepapers are pitched or uploaded by a person.', 'Person sends the file or the pitch.', ['"submit a white paper"', '"resources" "suggest a resource"']),
  row('statistics_page', 'outreach', 'Statistics pages are resource outreach. The app does not invent statistics.', 'Person confirms the citation and the editor.', ['"statistics" "suggest a resource"', 'intitle:"statistics" "contact"']),
  row('qa_site', 'assisted', 'Q&A sites need a logged-in person to post. The app can draft the answer.', 'Person posts the answer and pastes the URL.', ['"ask a question"', 'inurl:questions']),
  row('forum', 'assisted', 'Forums require an account. The app does not register or post.', 'Person logs in, posts, and pastes the thread URL.', ['inurl:forum "register"', '"post a new topic"']),
  row('blog_comment', 'assisted', 'Comment forms are filled for review. A person submits, especially when a captcha is present.', 'Person submits the comment.', ['"leave a comment"', 'inurl:comments']),
  row('reddit', 'assisted', 'Reddit posting needs the user\'s own account. The app does not post.', 'Person posts in a relevant subreddit and pastes the comment URL.', ['site:reddit.com "weekly" self-promotion']),
  row('quora', 'assisted', 'Quora answers need the user\'s account.', 'Person posts the answer and pastes the URL.', ['site:quora.com']),
  row('social_bookmark', 'assisted', 'Bookmarking sites need an account. No bookmark is marked submitted until the user does it.', 'Person saves the bookmark and pastes the URL.', ['"social bookmark" "submit"', 'inurl:submit-bookmark']),
  row('directory', 'automatic', 'Public directory forms can be filled and submitted when the scanner finds a submission form and no login, captcha, or Cloudflare gate. Otherwise a person finishes it.', 'Person clears captcha or login, then the app verifies.', ['inurl:submit-site', 'inurl:submit.php "add url"', '"submit your site"'], directoryCurated),
  row('citation', 'automatic', 'Same as directories: a public add-business form can be submitted only after the scanner and the approval gate. Login-walled citation sites stay assisted.', 'Person signs in when the site requires an account.', ['"add your business"', 'inurl:add-company', 'inurl:add-business'], citationCurated),
  row('profile', 'assisted', 'Profiles need an account the user controls.', 'Person creates the profile and pastes the URL.', ['"create a profile"', 'inurl:register "company profile"']),
  row('testimonial', 'outreach', 'Testimonials are asked of a real customer or partner. The app does not post a review.', 'Person sends the request and later pastes the published URL.', ['"leave a testimonial"', '"write a review" contact']),
  row('partnership', 'outreach', 'Partnerships are email outreach to a real contact found on the page.', 'Person approves the email.', ['"partner with us"', '"become a partner"']),
  row('supplier_link', 'outreach', 'Supplier or customer links are requested from a real company.', 'Person sends the request from their mailbox.', ['"our suppliers"', '"where to buy" contact']),
  row('broken_link', 'outreach', 'Find a broken link on a live page, then email the owner. The app does not replace the link itself.', 'Person sends the email and checks the fix.', ['"page not found" inurl:resources', 'intitle:"resources"']),
  row('resource_page', 'outreach', 'Resource pages are outreach to the page owner.', 'Person sends the suggestion email.', ['"suggest a resource"', 'intitle:"resources" "contact"']),
  row('niche_edit', 'outreach', 'A niche edit is a request to an existing article\'s editor. It is never inserted automatically.', 'Person sends the request.', ['"write for us"', 'intitle:"contact the editor"']),
  row('brand_mention', 'outreach', 'A brand mention without a link is outreach asking for the link. The app does not edit the page.', 'Person sends the request.', ['"mentioned in" -site:yourdomain']),
  row('unlinked_mention', 'outreach', 'Same as a brand mention: find a real page that names the brand and email the author.', 'Person sends the request.', ['"according to" brand']),
  row('digital_pr', 'outreach', 'Digital PR is a pitch to a journalist. No wire service is called.', 'Person sends the pitch.', ['"media kit"', '"journalist" "contact"']),
  row('haro', 'outreach', 'HARO and similar journalist queries are outreach. This app does not subscribe to a paid query service.', 'Person replies to a query they actually received.', ['"journalist request" "source"']),
  row('edu', 'outreach', 'EDU links are outreach to a real .edu contact. A .edu homepage is not a placement.', 'Person emails the department.', ['site:.edu "resources" "suggest"', 'site:.edu "webmaster"']),
  row('gov', 'outreach', 'GOV links are outreach. The app does not submit to government forms unless a scan finds one.', 'Person follows the agency\'s published process.', ['site:.gov "contact the webmaster"']),
  row('news', 'outreach', 'News links are pitches to a reporter.', 'Person sends the pitch.', ['"news tips"', '"send a press release"']),
  row('podcast', 'outreach', 'Podcast links are guest pitches to a show that publishes a contact.', 'Person sends the pitch.', ['"be a guest" podcast', '"podcast" "booking"']),
  row('sponsorship', 'outreach', 'Sponsorships are commercial outreach, not an automatic placement.', 'Person negotiates and pastes the live URL.', ['"sponsorship opportunities"', '"become a sponsor"']),
  row('event', 'outreach', 'Event listings and speaking slots are outreach or a form the scanner confirms.', 'Person registers or emails the organizer.', ['"call for speakers"', '"submit an event"']),
] as const;

const BY_ID = new Map(CATEGORY_WORKFLOWS.map((w) => [w.id, w]));

export function workflowFor(id: string): CategoryWorkflow | null {
  return BY_ID.get(id as BacklinkTypeId) ?? null;
}

export function resolveExecutionMode(
  id: string,
  verdict: Pick<
    UrlScanVerdict,
    'broken' | 'captcha' | 'cloudflare' | 'loginRequired' | 'noForm' | 'submissionFormIndex' | 'contactEmails'
  >
): { mode: 'stop' | WorkflowMode; reason: string } {
  const workflow = workflowFor(id);
  if (verdict.broken) return { mode: 'stop', reason: 'The URL is broken. Stop.' };
  if (!workflow) return { mode: 'stop', reason: `Unknown backlink category "${id}".` };
  if (verdict.captcha || verdict.cloudflare) {
    return { mode: 'assisted', reason: 'A captcha or Cloudflare challenge has to be cleared by a person.' };
  }
  if (verdict.loginRequired) {
    return { mode: 'assisted', reason: 'Login is required before a form can be used.' };
  }
  if (verdict.submissionFormIndex != null && (workflow.mode === 'automatic' || workflow.id === 'directory' || workflow.id === 'citation')) {
    return { mode: 'automatic', reason: 'A public submission form was found with no login or captcha gate.' };
  }
  if (verdict.submissionFormIndex != null) {
    return { mode: 'assisted', reason: 'A form exists. A person submits it.' };
  }
  if (verdict.noForm && verdict.contactEmails.length > 0 && workflow.mode === 'outreach') {
    return { mode: 'outreach', reason: 'No submission form. A contact email was found, so this is outreach.' };
  }
  if (verdict.noForm && verdict.contactEmails.length === 0) {
    return { mode: 'stop', reason: 'No form and no contact email. There is no automatic next step.' };
  }
  return { mode: workflow.mode, reason: workflow.summary };
}

export function unavailableAiDraftMessage(kind: string): string {
  return `No AI provider is configured. Set GEMINI_API_KEY (free tier) or OLLAMA_BASE_URL. This ${kind} was not generated. Write it yourself. The app will not present a template as AI content.`;
}
