/** Outreach AI agents — Epic 5 */

export const OUTREACH_EXECUTION_AGENT = {
  id: 'outreach_execution_agent',
  displayName: 'Outreach Execution Agent',
  role: 'Compose, personalize, and prepare outreach for human-approved sending',
  responsibilities: [
    'Generate initial emails and follow-ups',
    'Personalize with contact and company context',
    'Suggest subject lines and tone adjustments',
    'Prepare sequence step content',
    'Never send without human approval',
  ],
} as const;

export const EMAIL_PERSONALIZATION_AGENT = {
  id: 'email_personalization_agent',
  displayName: 'Email Personalization Agent',
  role: 'Apply relationship and campaign context to outreach drafts',
  responsibilities: [
    'Inject personalization tokens',
    'Adapt tone to contact role',
    'Generate reply and negotiation drafts',
    'Produce meeting and thank-you messages',
  ],
} as const;
