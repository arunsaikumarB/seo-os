import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function listMemory(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  const [entries, facts] = await Promise.all([
    supabase
      .from('memory_entries')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('memory_facts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return { entries: entries.data ?? [], facts: facts.data ?? [] };
}

export async function createMemoryEntry(
  workspaceId: string,
  userId: string,
  input: { tier: string; content: string; metadata?: Record<string, unknown> }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('memory_entries')
    .insert({
      id,
      workspace_id: workspaceId,
      tier: input.tier,
      content: input.content,
      metadata: input.metadata ?? {},
      created_by: userId,
      source_type: 'user',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createMemoryFact(
  workspaceId: string,
  input: { factType: string; content: string }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('memory_facts')
    .insert({
      id,
      workspace_id: workspaceId,
      fact_type: input.factType,
      content: input.content,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function approveMemoryFact(factId: string, workspaceId: string, userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('memory_facts')
    .update({ status: 'approved', approved_by: userId })
    .eq('id', factId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadMemoryForContext(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  const [entries, facts] = await Promise.all([
    supabase
      .from('memory_entries')
      .select('tier, content')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('memory_facts')
      .select('fact_type, content')
      .eq('workspace_id', workspaceId)
      .eq('status', 'approved')
      .limit(20),
  ]);

  const memory = {
    brand: [] as string[],
    project: [] as string[],
    approvedPrompts: [] as string[],
    conversation: [] as string[],
    episodic: [] as string[],
  };

  for (const e of entries.data ?? []) {
    const tier = e.tier as keyof typeof memory;
    if (tier in memory) memory[tier].push(e.content);
    else memory.episodic.push(e.content);
  }

  for (const f of facts.data ?? []) {
    if (f.fact_type === 'brand') memory.brand.push(f.content);
    else if (f.fact_type === 'project') memory.project.push(f.content);
    else if (f.fact_type === 'approved_prompt') memory.approvedPrompts.push(f.content);
    else memory.episodic.push(f.content);
  }

  return memory;
}

export async function recordConversationMemory(
  workspaceId: string,
  userId: string,
  content: string
) {
  await createMemoryEntry(workspaceId, userId, {
    tier: 'conversation',
    content: content.slice(0, 500),
  });
}
