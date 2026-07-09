/** Template variable substitution — Epic 5 */

import type { PersonalizationContext } from './outreach-types.js';

export function applyPersonalization(text: string, ctx: PersonalizationContext): string {
  const map: Record<string, string> = {
    '{{contact_name}}': ctx.contactName ?? 'there',
    '{{contact_role}}': ctx.contactRole ?? 'Editor',
    '{{company_name}}': ctx.companyName ?? 'your organization',
    '{{domain}}': ctx.domain ?? '',
    '{{sender_name}}': ctx.senderName ?? 'Our team',
    '{{campaign_name}}': ctx.campaignName ?? 'our campaign',
    '{{opportunity_title}}': ctx.opportunityTitle ?? 'collaboration opportunity',
  };

  let result = text;
  for (const [token, value] of Object.entries(map)) {
    result = result.split(token).join(value);
  }
  return result;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
