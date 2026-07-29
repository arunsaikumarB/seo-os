import { describe, expect, it } from 'vitest';
import {
  analyzeWeb2Platform,
  detectWeb2PlatformFamily,
  extractSignupLoginFields,
  isCommentOnlyPublicForm,
  web2ProbeOverlay,
} from './web2-intelligence.js';
import { classifyProbedPage } from './link-probe.js';
import { detectSubmissionRequirements } from './submission-requirements.js';
import { probeDisqualifiesSubmission } from './submission-form-gate.js';

const WIDBLOG_ARTICLE = `
<html><head><title>Top Benefits of AI Interview Software for Modern Hiring Teams</title>
<meta property="og:title" content="Top Benefits of AI Interview Software for Modern Hiring Teams" />
<meta property="og:type" content="article" />
</head><body>
<article class="post">
<h1>Top Benefits of AI Interview Software</h1>
<h2>Faster Screening</h2>
<p>${'word '.repeat(200)}</p>
<h2>Better Quality</h2>
<p>${'insight '.repeat(200)}</p>
</article>
<div id="respond">
<form id="commentform" method="post">
<p id="email-notes"></p>
<textarea name="comment"></textarea>
<input name="author" />
<input name="email" />
<input name="url" />
<input type="submit" name="submit" />
<input type="hidden" name="comment_post_ID" value="1" />
<input type="hidden" name="comment_parent" value="0" />
</form>
</div>
<form method="get"><input name="s" type="search" /></form>
</body></html>`;

const WIDBLOG_SIGNUP = `
<html><body>
<form id="overlay-signup-form" method="post">
<input name="usr" />
<input name="email" />
<input name="pass" type="password" />
<div id="captcha_div"></div>
<input type="submit" name="signup" value="Sign up" />
</form>
</body></html>`;

describe('web2-intelligence', () => {
  it('detects free blog network hosts including subdomains', () => {
    expect(detectWeb2PlatformFamily('https://pramitihr.widblog.com/post/1')?.family).toBe(
      'free_blog_network'
    );
    expect(detectWeb2PlatformFamily('https://medium.com/@x/y')?.family).toBe('medium');
    expect(detectWeb2PlatformFamily('https://www.blogger.com/blog/posts/1')?.family).toBe(
      'blogger'
    );
    expect(detectWeb2PlatformFamily('https://random-directory.example/submit')).toBeNull();
  });

  it('treats comment+search forms as comment-only (not publish editor)', () => {
    expect(isCommentOnlyPublicForm(WIDBLOG_ARTICLE)).toBe(true);
    expect(isCommentOnlyPublicForm(WIDBLOG_SIGNUP)).toBe(false);
  });

  it('extracts signup fields from public signup page', () => {
    const { signupFields } = extractSignupLoginFields(WIDBLOG_SIGNUP);
    expect(signupFields).toEqual(expect.arrayContaining(['usr', 'email', 'pass']));
  });

  it('analyzes published article with curated publish recipe', () => {
    const w = analyzeWeb2Platform({
      url: 'https://pramitihr.widblog.com/95698783/top-benefits',
      html: WIDBLOG_ARTICLE,
      httpStatus: 200,
    });
    expect(w.detected).toBe(true);
    expect(w.loginRequiredForPublish).toBe(true);
    expect(w.commentOnlyPublicForm).toBe(true);
    expect(w.publishFields).toEqual(
      expect.arrayContaining(['title', 'body', 'tags', 'featuredImage'])
    );
    expect(w.publishedArticle?.wordCount).toBeGreaterThan(100);
    expect(w.storageType).toBe('web2');
  });

  it('applies host recipe even when HTML missing (403 Medium)', () => {
    const w = analyzeWeb2Platform({
      url: 'https://medium.com/@dhanista.m/some-article',
      html: null,
      httpStatus: 403,
    });
    expect(w.detected).toBe(true);
    expect(w.family).toBe('medium');
    expect(w.reasons.some((r) => r.includes('http_403'))).toBe(true);
    const overlay = web2ProbeOverlay(w);
    expect(overlay?.band).toBe('blocked');
    expect(overlay?.formFound).toBe(true);
  });
});

describe('link-probe web2 overlay', () => {
  it('does not mark widblog comment-only page as directory no_form dead-end', () => {
    const r = classifyProbedPage({
      url: 'https://pramitihr.widblog.com/95698783/post',
      html: WIDBLOG_ARTICLE,
      httpStatus: 200,
    });
    expect(r.web2?.detected).toBe(true);
    expect(r.band).toBe('blocked');
    expect(r.formFound).toBe(true);
    expect(r.reasons.some((x) => /web2_publish/i.test(x))).toBe(true);
    expect(probeDisqualifiesSubmission(r)).toBe(false);
  });

  it('rescues Medium 403 via host recipe', () => {
    const r = classifyProbedPage({
      url: 'https://medium.com/@x/article-slug',
      html: null,
      httpStatus: 403,
      fetchError: 'HTTP 403',
    });
    expect(r.web2?.family).toBe('medium');
    expect(r.band).toBe('blocked');
    expect(r.alive).toBe(true);
    expect(probeDisqualifiesSubmission(r)).toBe(false);
  });
});

describe('web2 submission requirements', () => {
  it('expands web2 required fields and length hints', () => {
    const req = detectSubmissionRequirements('web2');
    expect(req.requiredFields).toEqual(
      expect.arrayContaining([
        'seoTitle',
        'body',
        'tags',
        'metaDescription',
        'featuredImage',
        'imagePrompt',
      ])
    );
    expect(req.contentLengthHints?.minWords).toBe(800);
    expect(req.loginRequired).toBe(true);
  });

  it('maps blog_submission alias to web2 template', () => {
    const req = detectSubmissionRequirements('blog_submission');
    expect(req.requiredFields).toContain('imagePrompt');
    expect(req.contentLengthHints?.minWords).toBe(800);
  });
});
