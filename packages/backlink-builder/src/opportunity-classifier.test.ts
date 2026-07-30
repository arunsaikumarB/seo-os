import { describe, expect, it } from 'vitest';
import {
  classifyFromWebsiteInspection,
  extractWebsiteSignals,
  summarizeClassificationCounts,
} from './opportunity-classifier.js';

describe('opportunity classification engine', () => {
  it('classifies guest post from Write for Us signals, not domain alone', () => {
    const html = `
      <html><head><title>Tech Mag</title></head>
      <body>
        <nav><a href="/write-for-us">Write for Us</a><a href="/about">About</a></nav>
        <h1>Become a contributor</h1>
        <button>Submit a guest post</button>
        <form action="/contribute"><label>Pitch</label></form>
      </body></html>`;
    const signals = extractWebsiteSignals(html, { fetchOk: true, sitemapFound: true });
    const decision = classifyFromWebsiteInspection(signals, { domain: 'random-publisher.example' });
    expect(decision.classificationId).toBe('guest_post');
    expect(decision.confidence).toBeGreaterThanOrEqual(70);
    expect(decision.reason.toLowerCase()).toMatch(/write for us|guest/);
    expect(decision.assignedAgent).toBe('guest_post_agent');
    expect(decision.workflowQueue).toBe('guest_post');
  });

  it('classifies business directory from Add Business CTA', () => {
    const html = `
      <html><body>
        <nav><a>Directories</a></nav>
        <a class="btn">Add Your Business</a>
        <form action="/listings/new"><label>Business Name</label></form>
        <script type="application/ld+json">{"@type":"Organization"}</script>
      </body></html>`;
    const signals = extractWebsiteSignals(html, { fetchOk: true });
    const decision = classifyFromWebsiteInspection(signals);
    expect(['business_directory', 'directory_submission', 'niche_directory']).toContain(
      decision.classificationId
    );
    expect(decision.confidence).toBeGreaterThanOrEqual(60);
    expect(decision.workflowQueue).toBe('directory');
  });

  it('classifies video submission from upload workflow', () => {
    const html = `
      <html><body>
        <button>Upload Video</button>
        <form action="/videos/upload"><label>Video file</label><input type="file" /></form>
      </body></html>`;
    const signals = extractWebsiteSignals(html, { fetchOk: true });
    const decision = classifyFromWebsiteInspection(signals);
    expect(decision.classificationId).toBe('video_submission');
    expect(decision.assignedAgent).toBe('video_agent');
  });

  it('classifies phpLD Submit Link pages as Directory — not Forum from category text', () => {
    const html = `
      <html><head>
        <title>Ask Directory .com - Submit Link</title>
        <meta name="generator" content="Ask Directory .com Running on PHP Link Directory 2.2.0" />
      </head><body>
        <ul id="menu">
          <li><a href="/">Home</a></li>
          <li><a href="/submit.php" title="Submit your link to the directory">Add Site</a></li>
        </ul>
        <h1>Submit Link</h1>
        <form action="/submit.php" method="post">
          <label>URL</label><input name="url" />
          <label>Title</label><input name="title" />
          <select name="c">
            <option>Arts</option>
            <option>Chats and Forums</option>
            <option>Business</option>
          </select>
          <input type="submit" value="Submit Link" />
        </form>
      </body></html>`;
    const signals = extractWebsiteSignals(html, {
      fetchOk: true,
      pageUrl: 'https://ask-directory.com/submit.php',
    });
    expect(signals.hasForum).toBe(false);
    expect(signals.hasSubmitListing).toBe(true);
    const decision = classifyFromWebsiteInspection(signals, {
      domain: 'ask-directory.com',
      pageUrl: 'https://ask-directory.com/submit.php',
      fallbackType: 'directory',
    });
    expect(decision.classificationId).toBe('directory_submission');
    expect(decision.workflowQueue).toBe('directory');
    expect(decision.confidence).toBeGreaterThanOrEqual(70);
  });

  it('rejects post-submit confirmation URLs as non-actionable', () => {
    const signals = extractWebsiteSignals('<html><body>thanks</body></html>', {
      fetchOk: true,
      pageUrl: 'https://www.activesearchresults.com/urladdedconfirm.php',
    });
    const decision = classifyFromWebsiteInspection(signals, {
      domain: 'activesearchresults.com',
      pageUrl: 'https://www.activesearchresults.com/urladdedconfirm.php',
    });
    expect(decision.classificationId).toBe('outreach_required');
    expect(decision.reason.toLowerCase()).toMatch(/confirm|not a live/);
  });

  it('summarizes categorized counts', () => {
    const summary = summarizeClassificationCounts([
      { classificationId: 'guest_post', displayName: 'Guest Post' },
      { classificationId: 'guest_post', displayName: 'Guest Post' },
      { classificationId: 'directory_submission', displayName: 'Directory Submission' },
    ]);
    expect(summary[0]?.count).toBe(2);
    expect(summary.find((s) => s.id === 'directory_submission')?.count).toBe(1);
  });
});
