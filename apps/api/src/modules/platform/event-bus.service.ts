import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  WORKFLOW_TRIGGERABLE_EVENTS,
  type PublishPlatformEventInput,
} from './event-types.js';

export type { PublishPlatformEventInput, PlatformEventType } from './event-types.js';

/**
 * Central platform event bus — single publish path for feed, workflows, notifications, audit.
 */
export async function publishPlatformEvent(input: PublishPlatformEventInput) {
  const severity = input.severity ?? 'info';
  const payload = input.payload ?? {};

  const { data: event, error } = await getSupabaseAdmin()
    .from('platform_events')
    .insert({
      workspace_id: input.workspaceId ?? null,
      org_id: input.orgId ?? null,
      source_module: input.sourceModule,
      event_type: input.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      title: input.title,
      summary: input.summary ?? null,
      severity,
      payload,
      actor_id: input.actorId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    logger.warn({ err: error, eventType: input.eventType }, 'platform_events insert failed');
    return null;
  }

  // Fan-out: notifications
  if (input.notifyUserId) {
    const category =
      severity === 'failure'
        ? 'failure'
        : severity === 'warning'
          ? 'warning'
          : severity === 'approval'
            ? 'approval'
            : severity === 'recommendation'
              ? 'recommendation'
              : severity === 'success'
                ? 'success'
                : 'system';
    const { error: nErr } = await getSupabaseAdmin().from('notifications').insert({
      user_id: input.notifyUserId,
      org_id: input.orgId ?? null,
      workspace_id: input.workspaceId ?? null,
      event_id: event.id,
      category,
      title: input.title,
      body: input.summary ?? null,
      href: input.href ?? null,
    });
    if (nErr) logger.warn({ err: nErr }, 'notification insert failed');
  }

  // Fan-out: audit
  if (input.audit && input.orgId) {
    const { error: aErr } = await getSupabaseAdmin().from('audit_logs').insert({
      org_id: input.orgId,
      workspace_id: input.workspaceId ?? null,
      actor_id: input.actorId ?? null,
      actor_type: input.sourceModule === 'ai' || input.sourceModule === 'workflows' ? 'ai' : 'user',
      action: input.audit.action,
      resource_type: input.audit.resourceType ?? input.entityType ?? null,
      resource_id: input.audit.resourceId ?? input.entityId ?? null,
      before_state: input.audit.before ?? null,
      after_state: input.audit.after ?? null,
      metadata: { event_type: input.eventType, event_id: event.id },
    });
    if (aErr) logger.warn({ err: aErr }, 'audit_logs insert failed');
  }

  // Fan-out: workflow automation triggers (Epic 6 ↔ 6.1 bridge)
  if (input.workspaceId && WORKFLOW_TRIGGERABLE_EVENTS.has(input.eventType as never)) {
    try {
      const { triggerMatchingWorkflows } = await import('../workflows/workflow.service.js');
      await triggerMatchingWorkflows(
        input.workspaceId,
        input.eventType as
          | 'website_scan_completed'
          | 'opportunity_discovered'
          | 'campaign_created'
          | 'approval_granted'
          | 'reply_received'
          | 'backlink_verified',
        {
          ...payload,
          platformEventId: event.id,
          title: input.title,
        }
      );
    } catch (err) {
      logger.warn({ err, eventType: input.eventType }, 'workflow trigger fan-out failed');
    }
  }

  return event;
}

export async function listPlatformActivity(
  workspaceId: string,
  opts: { limit?: number; cursor?: string; types?: string[] } = {}
) {
  const limit = Math.min(opts.limit ?? 40, 100);
  let q = getSupabaseAdmin()
    .from('platform_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.cursor) q = q.lt('created_at', opts.cursor);
  if (opts.types?.length) q = q.in('event_type', opts.types);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listNotifications(userId: string, unreadOnly = false) {
  let q = getSupabaseAdmin()
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await getSupabaseAdmin()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return { ok: true };
}

export async function listAuditLogs(orgId: string, limit = 50) {
  const { data, error } = await getSupabaseAdmin()
    .from('audit_logs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw error;
  return data ?? [];
}

export function fireAndForget(promise: Promise<unknown>) {
  promise.catch((err) => logger.warn({ err }, 'platform event bus async failure'));
}
