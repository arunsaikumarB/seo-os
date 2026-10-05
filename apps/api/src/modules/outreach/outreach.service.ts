import { randomUUID } from 'node:crypto';
import {
  buildDefaultSequence,
  computeDeliverabilityRates,
  applyPersonalization,
  htmlToPlainText,
  type AiEmailType,
  type EmailTone,
} from '@seo-os/outreach-engine';
import { decryptSecret, encryptSecret } from '@seo-os/integrations';
import { createEmailProviderFromAccount, createSmtpEmailProvider, smtpConfigFromEnv } from '@seo-os/providers';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createApproval } from '../campaigns/approval.service.js';
import { logRelationshipTimeline } from '../relationships/relationship-intelligence.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';

export async function getOutreachSummary(workspaceId: string) {
  const [messages, events, tasks, drafts] = await Promise.all([
    getSupabaseAdmin()
      .from('outreach_messages')
      .select('id, status, direction')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('outreach_deliverability_events')
      .select('event_type')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('outreach_tasks')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending'),
    getSupabaseAdmin()
      .from('outreach_messages')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('status', ['draft', 'pending_approval']),
  ]);

  const msgs = messages.data ?? [];
  const sent = msgs.filter((m) => m.status === 'sent' && m.direction === 'outbound').length;
  const rates = computeDeliverabilityRates(events.data ?? [], sent);

  const pendingFollowUps = (tasks.data ?? []).length;
  const aiDraftQueue = (drafts.data ?? []).length;

  const inboxHealth =
    rates.bounceRate > 10 ? 'poor' : rates.bounceRate > 5 ? 'fair' : sent > 0 ? 'good' : 'unknown';

  return {
    emailsSent: sent,
    replies: rates.replied,
    openRate: rates.openRate,
    replyRate: rates.replyRate,
    pendingFollowUps,
    inboxHealth,
    aiDraftQueue,
    deliverability: rates,
    disclaimer: 'All outbound emails require human approval before sending.',
  };
}

export async function listEmailAccounts(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('email_accounts')
    .select('id, label, provider_type, from_email, from_name, is_default, status')
    .eq('workspace_id', workspaceId);
  return data ?? [];
}

export async function createSmtpEmailAccount(
  workspaceId: string,
  input: {
    label: string;
    fromEmail: string;
    fromName?: string | null;
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
    makeDefault?: boolean;
  }
) {
  if (!process.env.ENCRYPTION_KEY?.trim()) {
    throw new Error('Set ENCRYPTION_KEY before storing an SMTP password.');
  }
  const passEnc = encryptSecret(input.pass);
  const secure = input.secure ?? input.port === 465;
  if (input.makeDefault) {
    await getSupabaseAdmin()
      .from('email_accounts')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId);
  }
  const { data, error } = await getSupabaseAdmin()
    .from('email_accounts')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      label: input.label,
      provider_type: 'smtp',
      from_email: input.fromEmail,
      from_name: input.fromName ?? null,
      config: {
        host: input.host.trim(),
        port: input.port,
        secure,
        user: input.user.trim(),
        passEnc,
      },
      is_default: Boolean(input.makeDefault),
      status: 'active',
    })
    .select('id, label, provider_type, from_email, from_name, is_default, status')
    .single();
  if (error) throw error;
  return data;
}

function smtpConfigFromAccount(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  const passEnc = next.passEnc as { ciphertext?: string; iv?: string; authTag?: string | null } | undefined;
  if (passEnc?.ciphertext && passEnc.iv) {
    if (!process.env.ENCRYPTION_KEY?.trim()) {
      throw new Error('ENCRYPTION_KEY is required to read the stored SMTP password. No message was sent.');
    }
    next.pass = decryptSecret({
      ciphertext: passEnc.ciphertext,
      iv: passEnc.iv,
      authTag: passEnc.authTag ?? null,
    });
    delete next.passEnc;
  }
  return next;
}

export async function listTemplates(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('outreach_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name');
  if ((data ?? []).length) return data ?? [];

  const defaults = [
    {
      id: randomUUID(),
      workspace_id: workspaceId,
      name: 'Guest Post Introduction',
      category: 'guest_post',
      subject: 'Guest post idea for {{domain}}',
      body_html:
        '<p>Hi {{contact_name}},</p><p>I would love to contribute an original article to {{company_name}}.</p><p>Best,<br/>{{sender_name}}</p>',
      tone: 'professional',
      variables: ['{{contact_name}}', '{{company_name}}', '{{domain}}', '{{sender_name}}'],
    },
    {
      id: randomUUID(),
      workspace_id: workspaceId,
      name: 'Follow-up',
      category: 'follow_up',
      subject: 'Following up — {{company_name}}',
      body_html:
        '<p>Hi {{contact_name}},</p><p>Just checking in on my previous note about collaborating with {{company_name}}.</p><p>Best,<br/>{{sender_name}}</p>',
      tone: 'friendly',
      variables: ['{{contact_name}}', '{{company_name}}', '{{sender_name}}'],
    },
  ];
  await getSupabaseAdmin().from('outreach_templates').insert(defaults);
  return defaults;
}

export async function listThreads(workspaceId: string, limit = 50) {
  const { data } = await getSupabaseAdmin()
    .from('outreach_threads')
    .select(
      `
      *,
      relationship_contacts(id, name, role, public_email),
      relationship_organizations(id, company_name, domain, warmth)
    `
    )
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function getThread(threadId: string, workspaceId: string) {
  const { data: thread } = await getSupabaseAdmin()
    .from('outreach_threads')
    .select(
      `
      *,
      relationship_contacts(id, name, role, public_email, linkedin_url),
      relationship_organizations(id, company_name, domain, warmth, relationship_score),
      outreach_sequences(id, name, status, current_step)
    `
    )
    .eq('id', threadId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!thread) return null;

  const [messages, tasks, timeline] = await Promise.all([
    getSupabaseAdmin()
      .from('outreach_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
    getSupabaseAdmin()
      .from('outreach_tasks')
      .select('*')
      .eq('thread_id', threadId)
      .order('due_at', { ascending: true }),
    thread.organization_id
      ? getSupabaseAdmin()
          .from('relationship_timeline')
          .select('*')
          .eq('organization_id', thread.organization_id)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    ...thread,
    messages: messages.data ?? [],
    tasks: tasks.data ?? [],
    relationshipTimeline: thread.organization_id ? (timeline.data ?? []) : [],
  };
}

export async function listSequences(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('outreach_sequences')
    .select('*, outreach_sequence_steps(count)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function getSequence(sequenceId: string, workspaceId: string) {
  const { data: seq } = await getSupabaseAdmin()
    .from('outreach_sequences')
    .select('*')
    .eq('id', sequenceId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!seq) return null;

  const { data: steps } = await getSupabaseAdmin()
    .from('outreach_sequence_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('step_order');

  return { ...seq, steps: steps ?? [] };
}

export async function createSequence(
  workspaceId: string,
  input: { name: string; contactId?: string; organizationId?: string; campaignId?: string }
) {
  const built = buildDefaultSequence(input.name);
  const seqId = randomUUID();

  await getSupabaseAdmin()
    .from('outreach_sequences')
    .insert({
      id: seqId,
      workspace_id: workspaceId,
      name: built.name,
      status: 'draft',
      contact_id: input.contactId ?? null,
      organization_id: input.organizationId ?? null,
      campaign_id: input.campaignId ?? null,
    });

  const stepRows = built.steps.map((s, i) => ({
    id: randomUUID(),
    sequence_id: seqId,
    step_order: i + 1,
    step_type: s.stepType,
    delay_days: s.delayDays ?? 0,
    subject: s.subject ?? null,
    body_html: s.bodyHtml ?? null,
  }));

  await getSupabaseAdmin().from('outreach_sequence_steps').insert(stepRows);
  return getSequence(seqId, workspaceId);
}

export async function createMessage(
  workspaceId: string,
  userId: string,
  input: {
    threadId?: string;
    toEmail: string;
    subject: string;
    bodyHtml: string;
    contactId?: string;
    organizationId?: string;
    campaignId?: string;
    tone?: EmailTone;
    scheduledAt?: string;
    attachments?: unknown[];
  }
) {
  let threadId = input.threadId;

  if (!threadId) {
    threadId = randomUUID();
    await getSupabaseAdmin()
      .from('outreach_threads')
      .insert({
        id: threadId,
        workspace_id: workspaceId,
        subject: input.subject,
        contact_id: input.contactId ?? null,
        organization_id: input.organizationId ?? null,
        campaign_id: input.campaignId ?? null,
        status: 'active',
        last_message_at: new Date().toISOString(),
      });
  }

  const messageId = randomUUID();
  const bodyText = htmlToPlainText(input.bodyHtml);

  await getSupabaseAdmin()
    .from('outreach_messages')
    .insert({
      id: messageId,
      workspace_id: workspaceId,
      thread_id: threadId,
      direction: 'outbound',
      to_email: input.toEmail,
      subject: input.subject,
      body_html: input.bodyHtml,
      body_text: bodyText,
      status: input.scheduledAt ? 'scheduled' : 'draft',
      tone: input.tone ?? 'professional',
      contact_id: input.contactId ?? null,
      organization_id: input.organizationId ?? null,
      campaign_id: input.campaignId ?? null,
      scheduled_at: input.scheduledAt ?? null,
      attachments: input.attachments ?? [],
      created_by: userId,
    });

  await getSupabaseAdmin()
    .from('outreach_threads')
    .update({ last_message_at: new Date().toISOString(), subject: input.subject })
    .eq('id', threadId);

  return { messageId, threadId };
}

export async function generateAiMessage(
  workspaceId: string,
  userId: string,
  input: {
    type: AiEmailType;
    tone?: EmailTone;
    toEmail: string;
    contactId?: string;
    organizationId?: string;
    campaignId?: string;
    threadId?: string;
    context?: Record<string, string>;
  }
) {
  let contactName = input.context?.contactName;
  let companyName = input.context?.companyName;
  let domain = input.context?.domain;
  let contactRole = input.context?.contactRole;

  if (input.contactId) {
    const { data: c } = await getSupabaseAdmin()
      .from('relationship_contacts')
      .select('name, role, relationship_organizations(company_name, domain)')
      .eq('id', input.contactId)
      .single();
    if (c) {
      contactName = c.name;
      contactRole = c.role ?? undefined;
      const org = c.relationship_organizations as { company_name?: string; domain?: string } | null;
      companyName = org?.company_name;
      domain = org?.domain;
    }
  }

  const { draftWithConfiguredAi } = await import('../backlinks/ai-draft.service.js');
  const draft = await draftWithConfiguredAi(
    `${input.type} email`,
    [
      `Write a ${input.type} outreach email.`,
      `Tone: ${input.tone ?? 'professional'}`,
      `To: ${input.toEmail}`,
      `Contact: ${contactName ?? 'unknown'} (${contactRole ?? 'unknown role'})`,
      `Company: ${companyName ?? 'unknown'}`,
      `Domain: ${domain ?? 'unknown'}`,
      `Sender: ${input.context?.senderName ?? 'unknown'}`,
      `Campaign: ${input.context?.campaignName ?? 'unknown'}`,
      `Opportunity: ${input.context?.opportunityTitle ?? 'unknown'}`,
      `Notes: ${input.context?.notes ?? 'none'}`,
      'Use only these facts. Say unknown when a fact is missing. Do not invent metrics, quotes, or a message id.',
      'First line: Subject: ... then a blank line, then the email body.',
    ].join('\n')
  );
  const subjectLine = /^subject:\s*(.+)$/im.exec(draft.content)?.[1]?.trim();
  const subject = draft.generated
    ? (subjectLine || `Outreach: ${input.type}`).slice(0, 180)
    : `Not generated — ${input.type}`;
  const bodyHtml = `<p>${draft.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`;

  const result = await createMessage(workspaceId, userId, {
    threadId: input.threadId,
    toEmail: input.toEmail,
    subject,
    bodyHtml,
    contactId: input.contactId,
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    tone: input.tone,
  });

  await getSupabaseAdmin()
    .from('outreach_messages')
    .update({ ai_generated: draft.generated, ai_type: input.type })
    .eq('id', result.messageId);

  return {
    ...result,
    subject,
    bodyHtml,
    generated: draft.generated,
    provider: draft.provider,
    subjectSuggestions: [] as string[],
  };
}

export async function submitMessageForApproval(
  messageId: string,
  workspaceId: string,
  userId: string
) {
  const { data: msg } = await getSupabaseAdmin()
    .from('outreach_messages')
    .select('*')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!msg) throw new Error('Message not found');
  if (!['draft', 'scheduled'].includes(String(msg.status))) {
    throw new Error('Message cannot be submitted for approval');
  }

  await getSupabaseAdmin()
    .from('outreach_messages')
    .update({ status: 'pending_approval' })
    .eq('id', messageId);

  await createApproval(workspaceId, userId, {
    approvalType: 'outreach_send',
    subjectId: messageId,
    subjectType: 'outreach_message',
    title: `Send email: ${msg.subject}`,
    summary: `To: ${msg.to_email}`,
    metadata: { threadId: msg.thread_id },
  });

  return { messageId, status: 'pending_approval' };
}

export async function executeSendMessage(messageId: string, workspaceId: string) {
  const { data: msg } = await getSupabaseAdmin()
    .from('outreach_messages')
    .select('*')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!msg) throw new Error('Message not found');

  let account: Record<string, unknown> | null = null;
  if (msg.email_account_id) {
    const { data } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('*')
      .eq('id', msg.email_account_id)
      .single();
    account = data;
  }
  let provider;
  let fromEmail: string;
  let accountId: string | null = null;
  if (!account || String(account.provider_type ?? 'mock') === 'mock') {
    const envSmtp = smtpConfigFromEnv();
    if (!envSmtp) {
      throw new Error(
        'Email is not connected. Connect Gmail, Outlook, or SMTP, or set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM. No message was sent.'
      );
    }
    provider = createSmtpEmailProvider(envSmtp);
    fromEmail = envSmtp.from;
  } else {
    const providerType = String(account.provider_type);
    const rawConfig = (account.config as Record<string, unknown>) ?? {};
    const config = providerType === 'smtp' ? smtpConfigFromAccount(rawConfig) : rawConfig;
    provider = createEmailProviderFromAccount(providerType, config);
    fromEmail = String(account.from_email ?? '');
    accountId = String(account.id);
    if (!fromEmail) {
      throw new Error('The email account has no from address. No message was sent.');
    }
  }

  const result = await provider.send({
    to: String(msg.to_email),
    subject: String(msg.subject),
    bodyHtml: String(msg.body_html),
    bodyText: msg.body_text ? String(msg.body_text) : undefined,
    from: fromEmail,
  });

  const now = new Date().toISOString();
  await getSupabaseAdmin()
    .from('outreach_messages')
    .update({
      status: 'sent',
      sent_at: now,
      from_email: fromEmail,
      email_account_id: accountId,
      provider_message_id: result.messageId,
    })
    .eq('id', messageId);

  await getSupabaseAdmin().from('outreach_deliverability_events').insert({
    id: randomUUID(),
    message_id: messageId,
    workspace_id: workspaceId,
    event_type: 'sent',
    occurred_at: now,
  });

  if (msg.thread_id) {
    await getSupabaseAdmin()
      .from('outreach_threads')
      .update({ last_message_at: now })
      .eq('id', msg.thread_id);
  }

  await logRelationshipTimeline(workspaceId, 'submission_sent', `Email sent: ${msg.subject}`, {
    organizationId: msg.organization_id ? String(msg.organization_id) : undefined,
    contactId: msg.contact_id ? String(msg.contact_id) : undefined,
    metadata: { messageId },
  });

  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      sourceModule: 'outreach',
      eventType: 'email_sent',
      title: `Email sent: ${msg.subject}`,
      summary: `To ${msg.to_email}`,
      severity: 'success',
      entityType: 'outreach_message',
      entityId: messageId,
      payload: { messageId, to: msg.to_email, providerMessageId: result.messageId },
      href: `/projects/${workspaceId}/outreach/inbox`,
    })
  );

  return { messageId, providerMessageId: result.messageId, status: 'sent' };
}

export async function enqueueSendMessage(messageId: string, workspaceId: string) {
  return enqueueJob(
    QUEUES.LOW,
    'outreach.send',
    { messageId, workspaceId },
    { singletonKey: messageId }
  );
}

export async function listTasks(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('outreach_tasks')
    .select('*, outreach_threads(subject)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('due_at', { ascending: true });
  return data ?? [];
}

export async function applyTemplate(
  templateId: string,
  workspaceId: string,
  context: Record<string, string>
) {
  const { data: tpl } = await getSupabaseAdmin()
    .from('outreach_templates')
    .select('*')
    .eq('id', templateId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!tpl) throw new Error('Template not found');

  return {
    subject: applyPersonalization(String(tpl.subject), context),
    bodyHtml: applyPersonalization(String(tpl.body_html), context),
    tone: tpl.tone,
  };
}
