import { randomUUID } from 'node:crypto';
import {
  buildDefaultSequence,
  computeDeliverabilityRates,
  generateAiEmail,
  suggestSubjects,
  applyPersonalization,
  htmlToPlainText,
  type AiEmailType,
  type EmailTone,
} from '@seo-os/outreach-engine';
import { createEmailProviderFromAccount } from '@seo-os/providers';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createApproval } from '../campaigns/approval.service.js';
import { logRelationshipTimeline } from '../relationships/relationship-intelligence.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';

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

export async function ensureDefaultEmailAccount(workspaceId: string) {
  const { data: existing } = await getSupabaseAdmin()
    .from('email_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1);

  if (existing?.length) return existing[0];

  const id = randomUUID();
  await getSupabaseAdmin().from('email_accounts').insert({
    id,
    workspace_id: workspaceId,
    label: 'Demo Sender (Mock)',
    provider_type: 'mock',
    from_email: 'outreach@seoos.demo',
    from_name: 'SEO OS Outreach',
    is_default: true,
    status: 'active',
  });
  return { id };
}

export async function listEmailAccounts(workspaceId: string) {
  await ensureDefaultEmailAccount(workspaceId);
  const { data } = await getSupabaseAdmin()
    .from('email_accounts')
    .select('id, label, provider_type, from_email, from_name, is_default, status')
    .eq('workspace_id', workspaceId);
  return data ?? [];
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
  await ensureDefaultEmailAccount(workspaceId);
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

  const generated = generateAiEmail({
    type: input.type,
    tone: input.tone,
    context: {
      contactName,
      contactRole,
      companyName,
      domain,
      senderName: input.context?.senderName ?? 'Our team',
      campaignName: input.context?.campaignName,
      opportunityTitle: input.context?.opportunityTitle,
      siteName: companyName ?? domain,
      opportunityType: input.context?.opportunityType,
      previousSubject: input.context?.previousSubject,
      notes: input.context?.notes,
    },
  });

  const result = await createMessage(workspaceId, userId, {
    threadId: input.threadId,
    toEmail: input.toEmail,
    subject: generated.subject,
    bodyHtml: generated.bodyHtml,
    contactId: input.contactId,
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    tone: input.tone,
  });

  await getSupabaseAdmin()
    .from('outreach_messages')
    .update({ ai_generated: true, ai_type: input.type })
    .eq('id', result.messageId);

  return {
    ...result,
    subject: generated.subject,
    bodyHtml: generated.bodyHtml,
    subjectSuggestions: suggestSubjects({ contactName, companyName, domain }),
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
  if (!account) {
    await ensureDefaultEmailAccount(workspaceId);
    const { data: defaultAcct } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
      .single();
    account = defaultAcct;
  }

  const provider = createEmailProviderFromAccount(
    String(account?.provider_type ?? 'mock'),
    (account?.config as Record<string, unknown>) ?? {}
  );

  const fromEmail = String(account?.from_email ?? 'outreach@seoos.demo');
  const result = await provider.send({
    to: String(msg.to_email),
    subject: String(msg.subject),
    bodyHtml: String(msg.body_html),
    bodyText: msg.body_text ? String(msg.body_text) : undefined,
  });

  const now = new Date().toISOString();
  await getSupabaseAdmin()
    .from('outreach_messages')
    .update({
      status: 'sent',
      sent_at: now,
      from_email: fromEmail,
      email_account_id: account?.id,
      provider_message_id: result.messageId,
    })
    .eq('id', messageId);

  const events = ['sent', 'delivered'] as const;
  for (const eventType of events) {
    await getSupabaseAdmin().from('outreach_deliverability_events').insert({
      id: randomUUID(),
      message_id: messageId,
      workspace_id: workspaceId,
      event_type: eventType,
      occurred_at: now,
    });
  }

  // Mock provider simulates engagement for demo
  if (String(account?.provider_type ?? 'mock') === 'mock') {
    const openAt = new Date(Date.now() + 3600_000).toISOString();
    await getSupabaseAdmin()
      .from('outreach_deliverability_events')
      .insert({
        id: randomUUID(),
        message_id: messageId,
        workspace_id: workspaceId,
        event_type: 'opened',
        occurred_at: openAt,
        metadata: { simulated: true },
      });
  }

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
