/** AI email generation — Epic 5 */

import type { AiEmailType, EmailTone, PersonalizationContext } from './outreach-types.js';
import { applyPersonalization } from './template-variables.js';

export interface AiEmailInput {
  type: AiEmailType;
  tone?: EmailTone;
  context: PersonalizationContext & {
    siteName?: string;
    opportunityType?: string;
    previousSubject?: string;
    notes?: string;
  };
}

const TONE_PREFIX: Record<EmailTone, string> = {
  professional: 'Professional and concise',
  friendly: 'Warm and approachable',
  formal: 'Formal and respectful',
  casual: 'Casual but credible',
  persuasive: 'Persuasive with clear value proposition',
};

export function generateAiEmail(input: AiEmailInput): {
  subject: string;
  bodyHtml: string;
  bodyText: string;
} {
  const ctx = input.context;
  const site = ctx.siteName ?? ctx.domain ?? 'your site';
  const contact = ctx.contactName ?? 'there';
  const company = ctx.companyName ?? site;
  const tone = TONE_PREFIX[input.tone ?? 'professional'];

  const templates: Record<AiEmailType, { subject: string; body: string }> = {
    initial: {
      subject: `Collaboration idea for ${site}`,
      body: `<p>Hi ${contact},</p>
<p>I came across ${site} while researching quality publications in ${ctx.opportunityType ?? 'your space'}. ${company} would be a strong fit for a collaboration.</p>
<p>Would you be open to a brief conversation about a potential guest contribution or partnership?</p>
<p>Best regards,<br/>{{sender_name}}</p>`,
    },
    reply: {
      subject: `Re: ${ctx.previousSubject ?? 'Our conversation'}`,
      body: `<p>Hi ${contact},</p>
<p>Thank you for your reply. I appreciate you taking the time to consider our proposal.</p>
<p>${ctx.notes ?? 'I wanted to follow up with a few more details that might be helpful.'}</p>
<p>Looking forward to hearing your thoughts.</p>
<p>Best,<br/>{{sender_name}}</p>`,
    },
    follow_up: {
      subject: `Following up — ${site}`,
      body: `<p>Hi ${contact},</p>
<p>I wanted to gently follow up on my previous message about collaborating with ${site}.</p>
<p>If timing isn't right, no worries — I'd be happy to reconnect when it makes sense.</p>
<p>Best,<br/>{{sender_name}}</p>`,
    },
    negotiation: {
      subject: `Re: Terms for ${ctx.opportunityTitle ?? 'collaboration'}`,
      body: `<p>Hi ${contact},</p>
<p>Thank you for sharing your editorial guidelines. We're flexible on anchor text and happy to align with your standards.</p>
<p>Please let me know if the proposed topic and outline work for your calendar.</p>
<p>Best,<br/>{{sender_name}}</p>`,
    },
    meeting_request: {
      subject: `Quick call about ${site}?`,
      body: `<p>Hi ${contact},</p>
<p>Would you have 15 minutes this week for a quick call to discuss a potential collaboration with ${site}?</p>
<p>I'm flexible on timing — please share what works best for you.</p>
<p>Best,<br/>{{sender_name}}</p>`,
    },
    guest_post: {
      subject: `Guest post pitch for ${site}`,
      body: `<p>Hi ${contact},</p>
<p>I'd like to contribute an original article to ${site} on a topic your readers would find valuable.</p>
<p>We can provide expert insights backed by data, with no promotional fluff — fully aligned with your editorial standards.</p>
<p>Would you like to see a brief outline?</p>
<p>Best,<br/>{{sender_name}}</p>`,
    },
    thank_you: {
      subject: `Thank you — ${site}`,
      body: `<p>Hi ${contact},</p>
<p>Thank you for publishing our piece and for the smooth collaboration. We really enjoyed working with ${company}.</p>
<p>Please don't hesitate to reach out if we can support future content initiatives.</p>
<p>Warm regards,<br/>{{sender_name}}</p>`,
    },
    subject_line: {
      subject: `3 subject line options for ${site}`,
      body: `<p>Subject line options (${tone}):</p>
<ol>
<li>Collaboration idea for ${site}</li>
<li>Guest contribution pitch — ${company}</li>
<li>Quick question about ${ctx.opportunityTitle ?? 'content partnership'}</li>
</ol>`,
    },
  };

  const t = templates[input.type];
  const bodyHtml = applyPersonalization(t.body, ctx);
  const subject = applyPersonalization(t.subject, ctx);

  return {
    subject,
    bodyHtml: `<!-- AI generated (${input.type}, ${input.tone ?? 'professional'}) -->\n${bodyHtml}`,
    bodyText: bodyHtml
      .replace(/<[^>]+>/g, '')
      .replace(/\n+/g, '\n')
      .trim(),
  };
}

export function suggestSubjects(ctx: PersonalizationContext & { siteName?: string }): string[] {
  const site = ctx.siteName ?? ctx.domain ?? 'your site';
  return [
    `Collaboration idea for ${site}`,
    `Guest post opportunity — ${ctx.companyName ?? site}`,
    `Quick question for ${ctx.contactName ?? 'the editorial team'}`,
    `Partnership with ${ctx.companyName ?? site}`,
    `Content idea for ${site} readers`,
  ];
}
