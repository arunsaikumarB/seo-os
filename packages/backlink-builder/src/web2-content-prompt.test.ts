import { describe, expect, it } from 'vitest';
import {
  buildContentGenerationPrompt,
  buildWeb2ArticlePrompt,
  isWeb2ArticleStorageType,
} from './web2-content-prompt.js';

const brand = {
  brandName: 'PramitiHR',
  companyName: 'PramitiHR',
  projectDomain: 'pramitihr.com',
  projectUrl: 'https://pramitihr.com',
  industry: 'HR tech',
  keyFeatures: ['AI interviews', 'Faster screening'],
  primaryTopics: ['recruitment', 'AI hiring'],
};

const opp = {
  title: 'AI interview software benefits',
  domain: 'widblog.com',
  opportunity_type: 'web2',
  score: 80,
  website_name: 'Widblog',
};

describe('web2 content prompts', () => {
  it('detects web2 / article storage types', () => {
    expect(isWeb2ArticleStorageType('web2')).toBe(true);
    expect(isWeb2ArticleStorageType('directory')).toBe(false);
    expect(isWeb2ArticleStorageType('guest_post', 'blog_submission')).toBe(true);
  });

  it('builds long-form web2 prompt with tags and imagePrompt schema', () => {
    const prompt = buildWeb2ArticlePrompt({
      brand,
      opp,
      storageType: 'web2',
      classificationLabel: 'Blog Submission',
      featureEmphasis: 'AI interviews',
    });
    expect(prompt).toMatch(/800-1500 words/i);
    expect(prompt).toMatch(/"tags"/);
    expect(prompt).toMatch(/"imagePrompt"/);
    expect(prompt).toMatch(/PramitiHR/);
  });

  it('routes buildContentGenerationPrompt to article branch for web2', () => {
    const article = buildContentGenerationPrompt({
      brand,
      opp,
      storageType: 'web2',
      classificationId: 'blog_submission',
    });
    const directory = buildContentGenerationPrompt({
      brand,
      opp: { ...opp, domain: 'somedir.com', opportunity_type: 'directory' },
      storageType: 'directory',
    });
    expect(article).toMatch(/Web 2\.0/);
    expect(directory).toMatch(/directory blurb/i);
    expect(directory).not.toMatch(/800-1500 words/i);
  });
});
