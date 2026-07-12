import { randomBytes } from 'node:crypto';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlag } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getMetricsSnapshot } from '../../lib/metrics.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';

function newInviteCode() {
  return `BETA-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function getBetaStatus(orgId: string) {
  const { data: org } = await getSupabaseAdmin()
    .from('organizations')
    .select('id, name, beta_mode, beta_cohort, beta_joined_at, plan')
    .eq('id', orgId)
    .maybeSingle();

  const { data: flags } = await getSupabaseAdmin()
    .from('beta_org_flags')
    .select('flags')
    .eq('org_id', orgId)
    .maybeSingle();

  const mergedFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...((flags?.flags as Partial<Record<FeatureFlag, boolean>>) ?? {}),
  };

  return {
    orgId,
    betaMode: Boolean(org?.beta_mode),
    cohort: org?.beta_cohort ?? null,
    joinedAt: org?.beta_joined_at ?? null,
    flags: mergedFlags,
  };
}

export async function enableOrgBeta(
  orgId: string,
  input: { cohort?: string; invitedBy?: string } = {}
) {
  const { data, error } = await getSupabaseAdmin()
    .from('organizations')
    .update({
      beta_mode: true,
      beta_cohort: input.cohort ?? 'closed-beta-0995',
      beta_joined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)
    .select('id, beta_mode, beta_cohort, beta_joined_at')
    .single();
  if (error) throw error;

  await getSupabaseAdmin().from('beta_org_flags').upsert({
    org_id: orgId,
    flags: { closed_beta: true, feedback_center: true },
    updated_at: new Date().toISOString(),
  });

  fireAndForget(
    publishPlatformEvent({
      orgId,
      sourceModule: 'system',
      eventType: 'beta_org_enabled',
      title: 'Organization enrolled in Closed Beta',
      severity: 'success',
      entityType: 'organization',
      entityId: orgId,
      actorId: input.invitedBy ?? null,
      audit: { action: 'beta.enable', resourceType: 'organization', resourceId: orgId },
    })
  );

  return data;
}

export async function createBetaInvitation(input: {
  email?: string;
  orgId?: string;
  notes?: string;
  invitedBy?: string;
  expiresInDays?: number;
}) {
  const code = newInviteCode();
  const expiresAt = new Date(
    Date.now() + (input.expiresInDays ?? 14) * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('beta_invitations')
    .insert({
      code,
      email: input.email ?? null,
      org_id: input.orgId ?? null,
      notes: input.notes ?? null,
      invited_by: input.invitedBy ?? null,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function acceptBetaInvitation(
  code: string,
  orgId: string,
  userId: string
) {
  const { data: invite } = await getSupabaseAdmin()
    .from('beta_invitations')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('status', 'pending')
    .maybeSingle();
  if (!invite) throw new Error('Invalid or used invitation code');
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await getSupabaseAdmin()
      .from('beta_invitations')
      .update({ status: 'expired' })
      .eq('id', invite.id);
    throw new Error('Invitation expired');
  }

  await enableOrgBeta(orgId, { invitedBy: userId, cohort: 'invite' });
  const { data, error } = await getSupabaseAdmin()
    .from('beta_invitations')
    .update({
      status: 'accepted',
      org_id: orgId,
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listAnnouncements(opts: { betaOnly?: boolean } = {}) {
  let q = getSupabaseAdmin()
    .from('beta_announcements')
    .select('*')
    .eq('active', true)
    .order('starts_at', { ascending: false })
    .limit(20);
  if (opts.betaOnly) q = q.in('audience', ['beta', 'all']);
  const { data, error } = await q;
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).filter((a) => {
    if (a.ends_at && new Date(a.ends_at).getTime() < now) return false;
    return new Date(a.starts_at).getTime() <= now;
  });
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  severity?: string;
  audience?: string;
  href?: string;
  createdBy?: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('beta_announcements')
    .insert({
      title: input.title,
      body: input.body,
      severity: input.severity ?? 'info',
      audience: input.audience ?? 'beta',
      href: input.href ?? null,
      created_by: input.createdBy ?? null,
      active: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function submitFeedback(input: {
  orgId: string;
  workspaceId?: string;
  userId?: string;
  type: 'bug' | 'feature' | 'general';
  title: string;
  body: string;
  severity?: string;
  category?: string;
  environment?: Record<string, unknown>;
  screenshotUrl?: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('beta_feedback')
    .insert({
      org_id: input.orgId,
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? 'medium',
      category: input.category ?? 'general',
      environment: input.environment ?? {},
      screenshot_url: input.screenshotUrl ?? null,
      status: 'open',
    })
    .select('*')
    .single();
  if (error) throw error;

  fireAndForget(
    publishPlatformEvent({
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      sourceModule: 'system',
      eventType: 'beta_feedback_submitted',
      title: `Beta feedback: ${input.type} — ${input.title}`,
      severity: input.severity === 'critical' || input.severity === 'high' ? 'warning' : 'info',
      entityType: 'beta_feedback',
      entityId: data.id,
      actorId: input.userId ?? null,
    })
  );

  return data;
}

export async function listFeedback(orgId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('beta_feedback')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function trackUsageEvent(input: {
  orgId: string;
  workspaceId?: string;
  userId?: string;
  eventKey: string;
  featureKey?: string;
  payload?: Record<string, unknown>;
}) {
  const { error } = await getSupabaseAdmin().from('beta_usage_events').insert({
    org_id: input.orgId,
    workspace_id: input.workspaceId ?? null,
    user_id: input.userId ?? null,
    event_key: input.eventKey,
    feature_key: input.featureKey ?? null,
    payload: input.payload ?? {},
  });
  if (error) throw error;
  return { ok: true };
}

export async function getBetaDashboard(orgId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [feedback, usage, invites, announcements, status] = await Promise.all([
    getSupabaseAdmin()
      .from('beta_feedback')
      .select('id, type, severity, status, created_at, title')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
    getSupabaseAdmin()
      .from('beta_usage_events')
      .select('id, event_key, feature_key, user_id, created_at')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .limit(500),
    getSupabaseAdmin()
      .from('beta_invitations')
      .select('id, status, code, email, created_at')
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(30),
    listAnnouncements({ betaOnly: true }),
    getBetaStatus(orgId),
  ]);

  const usageRows = usage.data ?? [];
  const uniqueUsers = new Set(usageRows.map((u) => u.user_id).filter(Boolean));
  const byFeature = new Map<string, number>();
  for (const u of usageRows) {
    const k = u.feature_key || u.event_key;
    byFeature.set(k, (byFeature.get(k) ?? 0) + 1);
  }

  const feedbackRows = feedback.data ?? [];
  const openBugs = feedbackRows.filter((f) => f.type === 'bug' && f.status === 'open').length;
  const metrics = getMetricsSnapshot();
  const crashRate =
    metrics.requests > 0 ? Math.round((metrics.errors / metrics.requests) * 1000) / 10 : 0;

  return {
    status,
    activeUsers7d: uniqueUsers.size,
    dailyUsage: usageRows.length,
    errors: metrics.errors,
    crashRate,
    apiAvgMs: metrics.avgMs,
    feedbackCount: feedbackRows.length,
    openBugs,
    featureUsage: [...byFeature.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
    recentFeedback: feedbackRows.slice(0, 10),
    invitations: invites.data ?? [],
    announcements,
  };
}

export async function seedDefaultAnnouncement() {
  const { data } = await getSupabaseAdmin()
    .from('beta_announcements')
    .select('id')
    .eq('title', 'Welcome to SEO OS Closed Beta')
    .limit(1);
  if (data?.length) return data[0];
  return createAnnouncement({
    title: 'Welcome to SEO OS Closed Beta',
    body: 'You are helping validate SEO OS before Version 1.0. Use Feedback Center for bugs and ideas. Aim to complete onboarding in under 15 minutes.',
    severity: 'info',
    audience: 'beta',
    href: '/org/feedback',
  });
}
