import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function logResearchEvent(
  workspaceId: string,
  event: { eventType: string; phase?: string; title: string; payload?: Record<string, unknown> }
) {
  await getSupabaseAdmin()
    .from('research_events')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      event_type: event.eventType,
      phase: event.phase ?? null,
      title: event.title,
      payload: event.payload ?? {},
    });
}

export async function listResearchEvents(workspaceId: string, limit = 30) {
  const { data, error } = await getSupabaseAdmin()
    .from('research_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
