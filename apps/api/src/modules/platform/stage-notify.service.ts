/**
 * Stage completion notifications — durable in-app alerts when pipeline stages finish.
 * Single fan-out through publishPlatformEvent (bell + Realtime); never invent "complete"
 * while Assisted packages remain un-actioned.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { publishPlatformEvent, fireAndForget } from './event-bus.service.js';
import type { PlatformEventSeverity, PlatformEventType } from './event-types.js';

export type StageNotifyKind =
  | 'import_analysis'
  | 'ai_review'
  | 'content_generation'
  | 'assisted_manual_prep'
  | 'auto_submit_batch'
  | 'report_generation'
  | 'campaign_finished';

export type StageNotifyInput = {
  workspaceId: string;
  kind: StageNotifyKind;
  /** Short stage label shown in the title */
  stageName: string;
  /** Outcome line, e.g. "Generated 22/22 packages · 0 failed" */
  summary: string;
  outcome: 'success' | 'partial' | 'failure';
  /** Prefer the acting user; otherwise all org members are notified */
  actorUserId?: string | null;
  orgId?: string | null;
  /** Absolute app path starting with /projects/... */
  href: string;
  /** Dedupe window — default 3 minutes for most stages; campaign uses fingerprint */
  dedupeMs?: number;
  /** Extra payload for fingerprint / email */
  payload?: Record<string, unknown>;
  /** When true, may email if user opted in (generation / campaign only) */
  longRunning?: boolean;
};

const KIND_TO_EVENT: Record<StageNotifyKind, PlatformEventType> = {
  import_analysis: 'stage_import_completed',
  ai_review: 'stage_ai_review_completed',
  content_generation: 'stage_content_generation_completed',
  assisted_manual_prep: 'stage_assisted_manual_prepared',
  auto_submit_batch: 'stage_auto_submit_batch_completed',
  report_generation: 'stage_report_ready',
  campaign_finished: 'stage_campaign_finished',
};

function severityFor(outcome: StageNotifyInput['outcome']): PlatformEventSeverity {
  if (outcome === 'failure') return 'failure';
  if (outcome === 'partial') return 'warning';
  return 'success';
}

async function resolveProject(workspaceId: string): Promise<{
  name: string;
  orgId: string | null;
}> {
  const { data } = await getSupabaseAdmin()
    .from('workspaces')
    .select('name, org_id')
    .eq('id', workspaceId)
    .maybeSingle();
  return {
    name: String(data?.name ?? 'Project'),
    orgId: data?.org_id != null ? String(data.org_id) : null,
  };
}

async function resolveNotifyUserIds(
  orgId: string | null,
  actorUserId?: string | null
): Promise<string[]> {
  if (actorUserId) return [actorUserId];
  if (!orgId) return [];
  const { data } = await getSupabaseAdmin()
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(50);
  return [...new Set((data ?? []).map((r) => String(r.user_id)).filter(Boolean))];
}

async function recentlyNotified(
  workspaceId: string,
  eventType: string,
  withinMs: number,
  fingerprint?: string
): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  let q = getSupabaseAdmin()
    .from('platform_events')
    .select('id, payload')
    .eq('workspace_id', workspaceId)
    .eq('event_type', eventType)
    .gte('created_at', since)
    .limit(5);
  const { data } = await q;
  if (!data?.length) return false;
  if (!fingerprint) return true;
  return data.some((row) => {
    const p = row.payload as { fingerprint?: string } | null;
    return p?.fingerprint === fingerprint;
  });
}

type NotifyPrefs = {
  inApp?: boolean;
  desktop?: boolean;
  emailLongRunning?: boolean;
};

async function loadUserNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();
  const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  const n = (prefs.notifications as NotifyPrefs | undefined) ?? {};
  return {
    inApp: n.inApp !== false,
    desktop: n.desktop !== false,
    emailLongRunning: n.emailLongRunning === true,
  };
}

async function maybeEmailLongRunning(opts: {
  userId: string;
  title: string;
  summary: string;
  href: string;
  projectName: string;
}) {
  const prefs = await loadUserNotifyPrefs(opts.userId);
  if (!prefs.emailLongRunning) return;

  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('email, full_name')
    .eq('id', opts.userId)
    .maybeSingle();
  const to = profile?.email != null ? String(profile.email) : '';
  if (!to) return;

  try {
    const { createEmailProviderFromAccount } = await import('@seo-os/providers');
    const provider = createEmailProviderFromAccount('mock', {});
    await provider.send({
      to,
      subject: `[SEO OS] ${opts.title}`,
      bodyText: `${opts.summary}\n\nProject: ${opts.projectName}\nOpen: ${opts.href}`,
      bodyHtml: `<p><strong>${opts.title}</strong></p><p>${opts.summary}</p><p>Project: ${opts.projectName}</p><p><a href="${opts.href}">Open in SEO OS</a></p>`,
    });
  } catch (err) {
    logger.warn({ err, userId: opts.userId }, 'stage notify email failed');
  }
}

/**
 * Emit a stage completion (or failure) notification.
 * Fire-and-forget safe — never throws to callers.
 */
export async function notifyStageComplete(input: StageNotifyInput): Promise<void> {
  try {
    const project = await resolveProject(input.workspaceId);
    const orgId = input.orgId ?? project.orgId;
    const eventType = KIND_TO_EVENT[input.kind];
    const fingerprint =
      input.payload?.fingerprint != null ? String(input.payload.fingerprint) : undefined;
    const dedupeMs = input.dedupeMs ?? (input.kind === 'campaign_finished' ? 3_600_000 : 180_000);

    if (await recentlyNotified(input.workspaceId, eventType, dedupeMs, fingerprint)) {
      return;
    }

    const userIds = await resolveNotifyUserIds(orgId, input.actorUserId);
    if (!userIds.length) {
      logger.warn({ workspaceId: input.workspaceId, kind: input.kind }, 'stage notify: no recipients');
      // Still record the platform event for activity feed
      await publishPlatformEvent({
        workspaceId: input.workspaceId,
        orgId,
        sourceModule: 'backlink_builder',
        eventType,
        title: `${input.stageName} · ${project.name}`,
        summary: input.summary,
        severity: severityFor(input.outcome),
        href: input.href,
        payload: {
          ...input.payload,
          stage: input.kind,
          stageName: input.stageName,
          projectName: project.name,
          outcome: input.outcome,
          fingerprint,
          at: new Date().toISOString(),
        },
        actorId: input.actorUserId ?? null,
      });
      return;
    }

    const title = `${input.stageName} · ${project.name}`;
    const severity = severityFor(input.outcome);
    const payload = {
      ...input.payload,
      stage: input.kind,
      stageName: input.stageName,
      projectName: project.name,
      outcome: input.outcome,
      fingerprint,
      at: new Date().toISOString(),
      desktop: true,
    };

    // One activity event; fan-out notifications per recipient
    const event = await publishPlatformEvent({
      workspaceId: input.workspaceId,
      orgId,
      sourceModule: 'backlink_builder',
      eventType,
      title,
      summary: input.summary,
      severity,
      href: input.href,
      payload,
      actorId: input.actorUserId ?? userIds[0] ?? null,
    });

    for (const userId of userIds) {
      const prefs = await loadUserNotifyPrefs(userId);
      if (prefs.inApp === false) continue;
      const { error: nErr } = await getSupabaseAdmin().from('notifications').insert({
        user_id: userId,
        org_id: orgId,
        workspace_id: input.workspaceId,
        event_id: event?.id ?? null,
        category:
          severity === 'failure'
            ? 'failure'
            : severity === 'warning'
              ? 'warning'
              : severity === 'success'
                ? 'success'
                : 'system',
        title,
        body: input.summary,
        href: input.href,
      });
      if (nErr) logger.warn({ err: nErr, userId }, 'stage notification insert failed');

      if (input.longRunning) {
        fireAndForget(
          maybeEmailLongRunning({
            userId,
            title,
            summary: input.summary,
            href: input.href,
            projectName: project.name,
          })
        );
      }
    }

    logger.info(
      { workspaceId: input.workspaceId, kind: input.kind, recipients: userIds.length },
      'stage notification emitted'
    );
  } catch (err) {
    logger.warn({ err, kind: input.kind, workspaceId: input.workspaceId }, 'stage notify failed');
  }
}

/** Convenience: fire without awaiting */
export function notifyStageCompleteAsync(input: StageNotifyInput): void {
  fireAndForget(notifyStageComplete(input));
}

export async function getNotificationPrefs(userId: string): Promise<{
  inApp: boolean;
  desktop: boolean;
  emailLongRunning: boolean;
}> {
  const p = await loadUserNotifyPrefs(userId);
  return {
    inApp: p.inApp !== false,
    desktop: p.desktop !== false,
    emailLongRunning: p.emailLongRunning === true,
  };
}

export async function updateNotificationPrefs(
  userId: string,
  patch: { inApp?: boolean; desktop?: boolean; emailLongRunning?: boolean }
) {
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();
  const prefs = (data?.preferences as Record<string, unknown>) ?? {};
  const prev = (prefs.notifications as Record<string, unknown>) ?? {};
  const next = {
    ...prefs,
    notifications: {
      ...prev,
      ...(patch.inApp != null ? { inApp: patch.inApp } : {}),
      ...(patch.desktop != null ? { desktop: patch.desktop } : {}),
      ...(patch.emailLongRunning != null ? { emailLongRunning: patch.emailLongRunning } : {}),
    },
  };
  const { error } = await getSupabaseAdmin()
    .from('profiles')
    .update({ preferences: next, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  return getNotificationPrefs(userId);
}
