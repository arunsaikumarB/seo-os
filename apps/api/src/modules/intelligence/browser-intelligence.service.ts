import { createHash, randomUUID } from 'node:crypto';
import {
  analyzePageIntelligence,
  BROWSER_SCAN_PHASES,
  buildBrandProfile,
  buildWebsiteProfile,
  classifyPageType,
  detectTechStack,
  discoverSitemapUrls,
  extractMetadataFromHtml,
  fetchRobotsTxt,
  filterUrlsByRobots,
  generateAiSummary,
  generateRecommendations,
  SCAN_LIMITS,
  simpleContentHash,
  type BrandProfile,
  type TechFingerprint,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logResearchEvent } from './research.service.js';
import { uploadDocument } from '../knowledge/document.service.js';
import { getProjectById } from '../projects/project.service.js';
import { enrichFromWebsiteProfile } from '../relationships/relationship-intelligence.service.js';

function extractDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getCachedHash(workspaceId: string, url: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from('browser_scan_cache')
    .select('content_hash')
    .eq('workspace_id', workspaceId)
    .eq('url', url)
    .maybeSingle();
  return data?.content_hash ?? null;
}

async function updateCache(
  workspaceId: string,
  domain: string,
  url: string,
  hash: string,
  status: number
) {
  await getSupabaseAdmin().from('browser_scan_cache').upsert(
    {
      workspace_id: workspaceId,
      domain,
      url,
      content_hash: hash,
      http_status: status,
      last_fetched_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,url' }
  );
}

export async function getBrowserIntelligenceSummary(workspaceId: string) {
  const [profiles, scans, discoveries, queue] = await Promise.all([
    getSupabaseAdmin()
      .from('website_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('website_scans')
      .select(
        'status, pages_read, discoveries_count, contact_pages_found, guest_post_pages_found, broken_links_found'
      )
      .eq('workspace_id', workspaceId)
      .eq('scan_type', 'browser_intelligence'),
    getSupabaseAdmin()
      .from('browser_intelligence_discoveries')
      .select('discovery_type', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('website_scans')
      .select('id, target_url, phase, status, created_at')
      .eq('workspace_id', workspaceId)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const completedScans = (scans.data ?? []).filter((s) => s.status === 'completed');
  const pagesRead = completedScans.reduce((a, s) => a + Number(s.pages_read ?? 0), 0);
  const opportunitiesFound = completedScans.reduce(
    (a, s) => a + Number(s.discoveries_count ?? 0),
    0
  );
  const contactPages = completedScans.reduce((a, s) => a + Number(s.contact_pages_found ?? 0), 0);
  const guestPostPages = completedScans.reduce(
    (a, s) => a + Number(s.guest_post_pages_found ?? 0),
    0
  );
  const brokenLinks = completedScans.reduce((a, s) => a + Number(s.broken_links_found ?? 0), 0);

  return {
    websitesScanned: profiles.count ?? 0,
    currentlyScanning: (queue.data ?? []).length,
    pagesRead,
    opportunitiesFound,
    contactPages,
    guestPostPages,
    brokenLinks,
    aiDiscoveries: discoveries.count ?? 0,
    scanQueue: queue.data ?? [],
    pipelinePhases: BROWSER_SCAN_PHASES,
    disclaimer:
      'Browser Intelligence analyzes public pages only. It does not submit forms, solve CAPTCHAs, or bypass authentication.',
  };
}

export async function listWebsiteProfiles(workspaceId: string, limit = 20) {
  const { data } = await getSupabaseAdmin()
    .from('website_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('last_scanned_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function getWebsiteProfile(profileId: string, workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('website_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('workspace_id', workspaceId)
    .single();
  return data;
}

export async function getProfileByDomain(domain: string, workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('website_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();
  return data;
}

export async function listScanDiscoveries(scanId: string, workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('browser_intelligence_discoveries')
    .select('*')
    .eq('scan_id', scanId)
    .eq('workspace_id', workspaceId)
    .order('confidence', { ascending: false });
  return data ?? [];
}

export async function listBrowserScans(workspaceId: string, limit = 20) {
  const { data } = await getSupabaseAdmin()
    .from('website_scans')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('scan_type', 'browser_intelligence')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function executeBrowserIntelligenceScan(
  scanId: string,
  workspaceId: string,
  orgId?: string
) {
  const supabase = getSupabaseAdmin();
  const { data: scan } = await supabase.from('website_scans').select('*').eq('id', scanId).single();
  if (!scan) throw new Error('Scan not found');

  const domain = extractDomain(scan.target_url);
  const origin = new URL(scan.target_url).origin;
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;

  const updatePhase = async (phase: string, extra?: Record<string, unknown>) => {
    await supabase
      .from('website_scans')
      .update({ phase, ...extra })
      .eq('id', scanId);
    await logResearchEvent(workspaceId, {
      eventType: 'browser_intelligence.progress',
      phase,
      title: `Browser Intelligence: ${phase.replace(/_/g, ' ')}`,
      payload: { scanId, domain },
    });
  };

  try {
    await supabase
      .from('website_scans')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        scan_type: 'browser_intelligence',
      })
      .eq('id', scanId);

    // Check for recent profile (incremental rescan)
    const existingProfile = await getProfileByDomain(domain, workspaceId);
    if (existingProfile?.content_hash && existingProfile.last_scanned_at) {
      const lastScan = new Date(existingProfile.last_scanned_at).getTime();
      const hoursSince = (Date.now() - lastScan) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        await updatePhase('completed');
        await supabase
          .from('website_scans')
          .update({
            status: 'completed',
            phase: 'completed',
            profile_id: existingProfile.id,
            ai_summary: existingProfile.ai_summary,
            ai_recommendations: existingProfile.ai_recommendations,
            completed_at: new Date().toISOString(),
          })
          .eq('id', scanId);
        await logResearchEvent(workspaceId, {
          eventType: 'browser_intelligence.completed',
          phase: 'completed',
          title: `Browser Intelligence complete (cached) — ${domain}`,
          payload: { scanId, profileId: existingProfile.id },
        });
        try {
          await enrichFromWebsiteProfile(workspaceId, String(existingProfile.id));
        } catch {
          /* relationship enrichment optional */
        }
        return { cached: true, profileId: existingProfile.id };
      }
    }

    await updatePhase('discovering_pages');
    const robots = await fetchRobotsTxt(origin);
    let pageUrls = await discoverSitemapUrls(scan.target_url, SCAN_LIMITS.maxPages);
    if (robots) pageUrls = filterUrlsByRobots(pageUrls, robots);

    await updatePhase('reading_content', {
      pages_discovered: pageUrls.length,
      sitemap_url: robots?.sitemaps[0],
    });

    const analyzedPages: Array<{
      url: string;
      meta: ReturnType<typeof extractMetadataFromHtml>;
      intelligence: ReturnType<typeof analyzePageIntelligence>;
      pageType: ReturnType<typeof classifyPageType>;
      httpStatus: number;
      contentHash: string;
      html: string;
    }> = [];

    let techStack: Record<string, unknown> = {};
    let brandProfile: Record<string, unknown> = {};
    const discoveries: Array<Record<string, unknown>> = [];
    let contactCount = 0;
    let guestPostCount = 0;
    let brokenCount = 0;

    for (let i = 0; i < pageUrls.length; i++) {
      const url = pageUrls[i];
      const delay = robots?.crawlDelayMs ?? SCAN_LIMITS.politenessDelayMs;
      if (i > 0) await sleep(delay);

      let retries = 0;
      while (retries <= SCAN_LIMITS.maxRetries) {
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(SCAN_LIMITS.fetchTimeoutMs),
            headers: { 'User-Agent': SCAN_LIMITS.userAgent },
          });

          if (!res.ok) {
            retries++;
            continue;
          }

          const html = await res.text();
          const hash = simpleContentHash(html);
          const cached = await getCachedHash(workspaceId, url);
          if (cached === hash) continue;

          await updateCache(workspaceId, domain, url, hash, res.status);

          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          const meta = extractMetadataFromHtml(url, html);
          const intelligence = analyzePageIntelligence(url, html, meta, origin);
          const pageType = classifyPageType(url, html, meta);

          if (pageType === 'contact') contactCount++;
          if (pageType === 'guest_post') guestPostCount++;
          brokenCount += intelligence.brokenLinks.length;

          analyzedPages.push({
            url,
            meta,
            intelligence,
            pageType,
            httpStatus: res.status,
            contentHash: hash,
            html,
          });

          if (i === 0) {
            techStack = detectTechStack(html, headers) as unknown as Record<string, unknown>;
            brandProfile = buildBrandProfile(meta, html) as unknown as Record<string, unknown>;
          }
          break;
        } catch {
          retries++;
        }
      }
    }

    await updatePhase('extracting_metadata', {
      pages_read: analyzedPages.length,
      pages_analyzed: analyzedPages.length,
    });

    const dbPages = analyzedPages.map((p) => ({
      id: randomUUID(),
      scan_id: scanId,
      workspace_id: workspaceId,
      url: p.url,
      path: p.meta.path,
      title: p.meta.title,
      meta_description: p.meta.metaDescription,
      h1: p.meta.h1,
      schema_types: p.meta.schemaTypes,
      word_count: p.meta.wordCount,
      http_status: p.httpStatus,
      page_type: p.pageType,
      has_contact_form: p.intelligence.hasContactForm,
      content_hash: p.contentHash,
      links_found: p.intelligence.externalLinks.slice(0, 20),
      broken_links: p.intelligence.brokenLinks,
      discovered_via: p.url === scan.target_url ? 'homepage' : 'sitemap',
    }));

    if (dbPages.length) {
      await supabase.from('website_pages').delete().eq('scan_id', scanId);
      await supabase.from('website_pages').insert(dbPages);
    }

    await updatePhase('finding_opportunities');
    await updatePhase('finding_contact_pages', { contact_pages_found: contactCount });

    const profileData = buildWebsiteProfile(
      domain,
      analyzedPages.map((p) => ({
        url: p.url,
        meta: p.meta,
        intelligence: p.intelligence,
        pageType: p.pageType,
      })),
      brandProfile as unknown as BrandProfile,
      techStack as unknown as TechFingerprint,
      { robotsTxt: robots?.raw, sitemapUrl: robots?.sitemaps[0] }
    );

    for (const oppType of profileData.opportunityTypes) {
      discoveries.push({
        id: randomUUID(),
        workspace_id: workspaceId,
        scan_id: scanId,
        discovery_type: 'opportunity',
        title: `${oppType.replace(/_/g, ' ')} opportunity`,
        confidence: profileData.confidenceScore,
        metadata: { type: oppType },
      });
    }
    for (const rp of profileData.resourcePages.slice(0, 5)) {
      discoveries.push({
        id: randomUUID(),
        workspace_id: workspaceId,
        scan_id: scanId,
        discovery_type: 'resource_page',
        title: 'Resource page',
        url: rp,
        confidence: 70,
        metadata: {},
      });
    }
    if (profileData.guestPostAvailable) {
      discoveries.push({
        id: randomUUID(),
        workspace_id: workspaceId,
        scan_id: scanId,
        discovery_type: 'guest_post_page',
        title: 'Guest post page detected',
        confidence: 85,
        metadata: {},
      });
    }

    await updatePhase('building_profile');

    const recommendations = generateRecommendations(profileData, project?.domain ?? undefined);
    const aiSummary = generateAiSummary(profileData);

    const profileId = existingProfile?.id ?? randomUUID();
    const contentHash = createHash('md5').update(JSON.stringify(profileData)).digest('hex');

    await supabase.from('website_profiles').upsert(
      {
        id: profileId,
        workspace_id: workspaceId,
        domain,
        website_name: profileData.websiteName,
        description: profileData.description,
        category: profileData.category,
        country: profileData.country,
        language: profileData.language,
        cms: profileData.cms,
        technology_stack: profileData.technologyStack,
        domain_authority: profileData.domainAuthority,
        estimated_traffic: profileData.estimatedTraffic,
        contact_email: profileData.contactEmail,
        has_contact_form: profileData.hasContactForm,
        author_pages: profileData.authorPages,
        social_links: profileData.socialLinks,
        submission_guidelines: profileData.submissionGuidelines,
        editorial_guidelines: profileData.editorialGuidelines,
        guest_post_available: profileData.guestPostAvailable,
        resource_pages: profileData.resourcePages,
        broken_links: profileData.brokenLinks,
        opportunity_types: profileData.opportunityTypes,
        faq_pages: profileData.faqPages,
        robots_txt: profileData.robotsTxt,
        sitemap_url: profileData.sitemapUrl,
        confidence_score: profileData.confidenceScore,
        ai_summary: recommendations.summary,
        ai_recommendations: recommendations,
        last_scan_id: scanId,
        last_scanned_at: new Date().toISOString(),
        content_hash: contentHash,
      },
      { onConflict: 'workspace_id,domain' }
    );

    if (discoveries.length) {
      await supabase
        .from('browser_intelligence_discoveries')
        .insert(discoveries.map((d) => ({ ...d, profile_id: profileId })));
    }

    await updatePhase('generating_ai_summary');

    // Store in Knowledge Engine
    try {
      const kbDoc = await uploadDocument(workspaceId, scan.created_by ?? randomUUID(), {
        title: `Website Intelligence: ${domain}`,
        content: `${recommendations.summary}\n\nProfile:\n${JSON.stringify(profileData, null, 2)}`,
        filename: `browser-intel-${domain}.md`,
        mimeType: 'text/markdown',
      });
      await logResearchEvent(workspaceId, {
        eventType: 'browser_intelligence.kb_stored',
        title: `Stored ${domain} profile in Knowledge Engine`,
        payload: { scanId, documentId: kbDoc.id, domain },
      });
    } catch {
      /* KB storage optional if limits hit */
    }

    await supabase
      .from('website_scans')
      .update({
        status: 'completed',
        phase: 'completed',
        profile_id: profileId,
        brand_profile: brandProfile,
        tech_stack: techStack,
        ai_summary: aiSummary,
        ai_recommendations: recommendations,
        discoveries_count: discoveries.length,
        contact_pages_found: contactCount,
        guest_post_pages_found: guestPostCount,
        broken_links_found: brokenCount,
        pages_read: analyzedPages.length,
        pages_analyzed: analyzedPages.length,
        content_inventory: {
          totalPages: analyzedPages.length,
          opportunityTypes: profileData.opportunityTypes,
          confidence: profileData.confidenceScore,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);

    await logResearchEvent(workspaceId, {
      eventType: 'browser_intelligence.completed',
      phase: 'completed',
      title: `Browser Intelligence complete — ${domain}`,
      payload: { scanId, profileId, discoveries: discoveries.length },
    });

    try {
      await enrichFromWebsiteProfile(workspaceId, profileId);
    } catch {
      /* relationship enrichment optional */
    }

    return { profileId, discoveries: discoveries.length, cached: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    await supabase
      .from('website_scans')
      .update({
        status: 'failed',
        error: message,
        retry_count: Number(scan.retry_count ?? 0) + 1,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);
    throw err;
  }
}

export async function startBrowserIntelligenceScan(
  workspaceId: string,
  userId: string,
  targetUrl: string
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('website_scans')
    .insert({
      id,
      workspace_id: workspaceId,
      target_url: targetUrl,
      status: 'queued',
      phase: 'discovering_pages',
      scan_type: 'browser_intelligence',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  await logResearchEvent(workspaceId, {
    eventType: 'browser_intelligence.queued',
    phase: 'discovering_pages',
    title: 'Browser Intelligence scan queued',
    payload: { scanId: id, targetUrl },
  });

  return data;
}
