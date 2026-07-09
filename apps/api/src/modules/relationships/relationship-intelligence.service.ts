import { randomUUID } from 'node:crypto';
import {
  buildOrganizationFromProfile,
  extractContactsFromPages,
  recommendOutreachContact,
  scoreRelationship,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { listMemory } from '../memory/memory.service.js';

export async function getRelationshipSummary(workspaceId: string) {
  const [orgs, contacts, timeline] = await Promise.all([
    getSupabaseAdmin()
      .from('relationship_organizations')
      .select('warmth, relationship_score, priority_score')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('relationship_contacts')
      .select('id, is_recommended_outreach')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('relationship_timeline')
      .select('event_type')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const organizations = orgs.data ?? [];
  const warmthCounts = { cold: 0, warm: 0, hot: 0, partner: 0 };
  for (const o of organizations) {
    const w = String(o.warmth) as keyof typeof warmthCounts;
    if (w in warmthCounts) warmthCounts[w]++;
  }

  const pendingFollowUps = (timeline.data ?? []).filter((t) =>
    ['submission_sent', 'content_generated'].includes(String(t.event_type))
  ).length;

  const topPartners = organizations
    .filter((o) => o.warmth === 'partner' || o.warmth === 'hot')
    .sort((a, b) => Number(b.relationship_score) - Number(a.relationship_score))
    .slice(0, 5);

  const avgHealth =
    organizations.length > 0
      ? Math.round(
          organizations.reduce((s, o) => s + Number(o.relationship_score ?? 0), 0) /
            organizations.length
        )
      : 0;

  return {
    contactsDiscovered: contacts.data?.length ?? 0,
    organizations: organizations.length,
    warmRelationships: warmthCounts.warm + warmthCounts.hot,
    hotLeads: warmthCounts.hot,
    partners: warmthCounts.partner,
    pendingFollowUps,
    topPartners,
    relationshipHealth: avgHealth,
    warmthBreakdown: warmthCounts,
    disclaimer:
      'Relationship Intelligence uses publicly available information only. No login scraping or automated outreach.',
  };
}

export async function listOrganizations(workspaceId: string, limit = 50) {
  const { data } = await getSupabaseAdmin()
    .from('relationship_organizations')
    .select('*, relationship_contacts(count)')
    .eq('workspace_id', workspaceId)
    .order('priority_score', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getOrganization(orgId: string, workspaceId: string) {
  const { data: org } = await getSupabaseAdmin()
    .from('relationship_organizations')
    .select('*')
    .eq('id', orgId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!org) return null;

  const [contacts, timeline, tags] = await Promise.all([
    getSupabaseAdmin()
      .from('relationship_contacts')
      .select('*')
      .eq('organization_id', orgId)
      .order('confidence_score', { ascending: false }),
    getSupabaseAdmin()
      .from('relationship_timeline')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(30),
    getSupabaseAdmin()
      .from('relationship_org_tags')
      .select('tag_id, relationship_tags(id, name, color)')
      .eq('organization_id', orgId),
  ]);

  return {
    ...org,
    contacts: contacts.data ?? [],
    timeline: timeline.data ?? [],
    tags: (tags.data ?? []).map((t) => t.relationship_tags),
  };
}

export async function listContacts(workspaceId: string, recommendedOnly = false) {
  let query = getSupabaseAdmin()
    .from('relationship_contacts')
    .select('*, relationship_organizations(id, company_name, domain, warmth)')
    .eq('workspace_id', workspaceId)
    .order('confidence_score', { ascending: false })
    .limit(100);

  if (recommendedOnly) query = query.eq('is_recommended_outreach', true);

  const { data } = await query;
  return data ?? [];
}

export async function listTimeline(workspaceId: string, limit = 50) {
  const { data } = await getSupabaseAdmin()
    .from('relationship_timeline')
    .select('*, relationship_organizations(company_name, domain), relationship_contacts(name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function logRelationshipTimeline(
  workspaceId: string,
  eventType: string,
  title: string,
  opts: {
    organizationId?: string;
    contactId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  await getSupabaseAdmin()
    .from('relationship_timeline')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      organization_id: opts.organizationId ?? null,
      contact_id: opts.contactId ?? null,
      event_type: eventType,
      title,
      description: opts.description ?? null,
      metadata: opts.metadata ?? {},
    });
}

export async function enrichFromWebsiteProfile(workspaceId: string, profileId: string) {
  const { data: profile } = await getSupabaseAdmin()
    .from('website_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!profile) throw new Error('Website profile not found');

  const { data: pages } = await getSupabaseAdmin()
    .from('website_pages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('scan_id', profile.last_scan_id ?? '')
    .order('created_at', { ascending: false })
    .limit(30);

  const domainPages = (pages ?? []).length
    ? (pages ?? [])
    : ((
        await getSupabaseAdmin()
          .from('website_pages')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(30)
      ).data?.filter((p) => String(p.url).includes(String(profile.domain))) ?? []);

  const orgData = buildOrganizationFromProfile({
    domain: String(profile.domain),
    website_name: profile.website_name as string | undefined,
    category: profile.category as string | undefined,
    country: profile.country as string | undefined,
    language: profile.language as string | undefined,
    contact_email: profile.contact_email as string | undefined,
    social_links: profile.social_links as string[] | undefined,
    author_pages: profile.author_pages as string[] | undefined,
    resource_pages: profile.resource_pages as string[] | undefined,
    guest_post_available: Boolean(profile.guest_post_available),
  });

  const discoveredContacts = extractContactsFromPages(
    domainPages.map((p) => ({
      url: String(p.url),
      pageType: p.page_type as string | undefined,
      title: p.title as string | undefined,
      emails: profile.contact_email ? [String(profile.contact_email)] : [],
      authorNames: [],
      socialLinks: profile.social_links as string[] | undefined,
    }))
  );

  if (profile.contact_email && !discoveredContacts.some((c) => c.publicEmail)) {
    discoveredContacts.unshift({
      name: 'Primary Contact',
      role: 'Editor',
      publicEmail: String(profile.contact_email),
      preferredContactMethod: 'email',
      confidenceScore: 80,
    });
  }

  const { data: existingOrg } = await getSupabaseAdmin()
    .from('relationship_organizations')
    .select('id, backlinks_won, campaign_count')
    .eq('workspace_id', workspaceId)
    .eq('domain', orgData.domain)
    .maybeSingle();

  const finalOrgId = existingOrg?.id ?? randomUUID();

  const scores = scoreRelationship({
    domainAuthority: profile.domain_authority as number | undefined,
    contactCount: discoveredContacts.length,
    hasContactEmail: Boolean(profile.contact_email),
    hasContactForm: Boolean(profile.has_contact_form),
    guestPostAvailable: Boolean(profile.guest_post_available),
    confidenceScore: profile.confidence_score as number | undefined,
    backlinksWon: existingOrg?.backlinks_won as number | undefined,
    campaignCount: existingOrg?.campaign_count as number | undefined,
  });

  await getSupabaseAdmin()
    .from('relationship_organizations')
    .upsert(
      {
        id: finalOrgId,
        workspace_id: workspaceId,
        company_name: orgData.companyName,
        domain: orgData.domain,
        website: `https://${orgData.domain}`,
        industry: orgData.industry,
        country: orgData.country,
        language: orgData.language,
        team_page_url: orgData.teamPageUrl,
        contact_page_url: orgData.contactPageUrl,
        editorial_page_url: orgData.editorialPageUrl,
        submission_page_url: orgData.submissionPageUrl,
        social_profiles: orgData.socialProfiles,
        relationship_score: scores.relationshipStrength,
        response_probability: scores.responseProbability,
        campaign_suitability: scores.campaignSuitability,
        collaboration_potential: scores.collaborationPotential,
        priority_score: scores.priorityScore,
        risk_score: scores.riskScore,
        warmth: scores.warmth,
        website_profile_id: profileId,
        last_enriched_at: new Date().toISOString(),
        notes: scores.recommendedAction,
      },
      { onConflict: 'workspace_id,domain' }
    );

  const contactRows = [];
  for (const c of discoveredContacts) {
    const contactId = randomUUID();
    contactRows.push({
      id: contactId,
      workspace_id: workspaceId,
      organization_id: finalOrgId,
      name: c.name,
      role: c.role,
      department: c.department,
      public_email: c.publicEmail,
      linkedin_url: c.linkedinUrl,
      twitter_url: c.twitterUrl,
      github_url: c.githubUrl,
      author_page_url: c.authorPageUrl,
      bio: c.bio,
      preferred_contact_method: c.preferredContactMethod,
      confidence_score: c.confidenceScore,
      relationship_strength: scores.relationshipStrength,
      is_recommended_outreach: false,
    });
  }

  if (contactRows.length) {
    await getSupabaseAdmin()
      .from('relationship_contacts')
      .delete()
      .eq('organization_id', finalOrgId);
    await getSupabaseAdmin().from('relationship_contacts').insert(contactRows);

    const recommendedId = recommendOutreachContact(
      contactRows.map((c) => ({
        id: c.id,
        role: c.role,
        confidence_score: c.confidence_score,
        public_email: c.public_email,
      }))
    );
    if (recommendedId) {
      await getSupabaseAdmin()
        .from('relationship_contacts')
        .update({ is_recommended_outreach: true })
        .eq('id', recommendedId);
    }
  }

  await logRelationshipTimeline(
    workspaceId,
    'organization_enriched',
    `Enriched ${orgData.companyName}`,
    {
      organizationId: finalOrgId,
      description: scores.recommendedAction,
    }
  );

  for (const c of discoveredContacts.slice(0, 3)) {
    await logRelationshipTimeline(
      workspaceId,
      'contact_discovered',
      `Discovered ${c.name} (${c.role})`,
      {
        organizationId: finalOrgId,
      }
    );
  }

  await logRelationshipTimeline(workspaceId, 'outreach_recommended', scores.recommendedAction, {
    organizationId: finalOrgId,
  });

  await getSupabaseAdmin().from('backlink_relationships').upsert(
    {
      id: randomUUID(),
      workspace_id: workspaceId,
      domain: orgData.domain,
      contact_name: discoveredContacts[0]?.name,
      contact_email: discoveredContacts[0]?.publicEmail,
      contact_role: discoveredContacts[0]?.role,
      warmth: scores.warmth,
      organization_id: finalOrgId,
      notes: scores.recommendedAction,
    },
    { onConflict: 'workspace_id,domain' }
  );

  const memory = await listMemory(workspaceId);
  return {
    organizationId: finalOrgId,
    contactsDiscovered: discoveredContacts.length,
    scores,
    memoryContextUsed: memory.entries.length + memory.facts.length,
  };
}

export async function discoverFromBrowserProfiles(workspaceId: string) {
  const { data: profiles } = await getSupabaseAdmin()
    .from('website_profiles')
    .select('id, domain')
    .eq('workspace_id', workspaceId)
    .order('last_scanned_at', { ascending: false })
    .limit(20);

  const results = [];
  for (const p of profiles ?? []) {
    try {
      const result = await enrichFromWebsiteProfile(workspaceId, String(p.id));
      results.push({ domain: p.domain, ...result });
    } catch {
      continue;
    }
  }
  return { enriched: results.length, results };
}

export async function getRecommendedContacts(workspaceId: string, campaignType?: string) {
  const contacts = await listContacts(workspaceId, true);
  return contacts.map((c) => ({
    ...c,
    campaignMatch: campaignType
      ? String(c.role).toLowerCase().includes(campaignType.toLowerCase())
      : true,
  }));
}
