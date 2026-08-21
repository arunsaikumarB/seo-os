import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { BrandContext } from '@seo-os/backlink-builder';

/** Reuse project brand context without duplicating project.service import cycles */
export async function getBrandContextForBee(workspaceId: string): Promise<BrandContext> {
  const { data: ws } = await getSupabaseAdmin()
    .from('workspaces')
    .select(
      'id, name, domain, url, industry, contact_email, contact_name, contact_phone, company_name, brand_profile'
    )
    .eq('id', workspaceId)
    .maybeSingle();

  const profile =
    ws?.brand_profile && typeof ws.brand_profile === 'object'
      ? (ws.brand_profile as Record<string, unknown>)
      : {};

  const topics = Array.isArray(profile.primaryTopics)
    ? (profile.primaryTopics as string[])
    : [];
  const features = Array.isArray(profile.keyFeatures)
    ? (profile.keyFeatures as string[])
    : [];
  const tagline = profile.tagline ? String(profile.tagline) : undefined;

  return {
    brandName: String((ws?.company_name as string) || (ws?.name as string) || '').trim(),
    projectDomain: (ws?.domain as string | undefined) ?? undefined,
    projectUrl: (ws?.url as string | undefined) ?? undefined,
    industry: (ws?.industry as string | undefined) ?? undefined,
    brandVoice: profile.tone ? String(profile.tone) : undefined,
    tagline,
    primaryTopics: topics,
    keyFeatures: features,
    knowledgeSnippets: [tagline, ...topics, ...features].filter(Boolean).slice(0, 8) as string[],
    contactEmail: (ws?.contact_email as string | undefined) ?? undefined,
    contactName: (ws?.contact_name as string | undefined) ?? undefined,
    contactPhone: (ws?.contact_phone as string | undefined) ?? undefined,
    companyName:
      (ws?.company_name as string | undefined) || (ws?.name as string | undefined) || undefined,
  };
}
