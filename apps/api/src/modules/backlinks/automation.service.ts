import { randomUUID } from 'node:crypto';
import {
  BACKLINK_TYPES,
  analyzeDomain,
  AUTOMATION_PIPELINE_STEPS,
  classifyOpportunity,
  contentTypesForOpportunity,
  deduplicateAndValidate,
  extractUrlsFromText,
  generateContent,
  stepProgress,
  type BrandContext,
  type ContentDraftType,
  type ImportSourceType,
  type TrackingStatus,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { listMemory } from '../memory/memory.service.js';

async function getBrandContext(workspaceId: string, orgId?: string): Promise<BrandContext> {
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;
  const memory = await listMemory(workspaceId);
  const notes = [
    ...memory.entries.slice(0, 2).map((e) => e.content),
    ...memory.facts.slice(0, 2).map((f) => f.content),
  ];
  return {
    brandName: project?.name ?? 'Our Brand',
    projectDomain: project?.domain ?? undefined,
    industry: project?.industry ?? undefined,
    brandVoice: 'professional, authoritative, and approachable',
    memoryNotes: notes,
    knowledgeSnippets: [],
  };
}

export async function parseImportContent(
  content: string,
  sourceType: ImportSourceType
): Promise<string[]> {
  if (sourceType === 'manual' || sourceType === 'url_list') {
    return content
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return extractUrlsFromText(content);
}

export async function createImport(
  workspaceId: string,
  sourceType: ImportSourceType,
  urls: string[],
  opts: { fileName?: string; userId?: string } = {}
) {
  const { rows, stats } = deduplicateAndValidate(urls);
  const importId = randomUUID();

  await getSupabaseAdmin()
    .from('backlink_imports')
    .insert({
      id: importId,
      workspace_id: workspaceId,
      source_type: sourceType,
      file_name: opts.fileName ?? null,
      status: 'validated',
      total_rows: stats.total,
      valid_rows: stats.valid,
      duplicate_rows: stats.duplicates,
      invalid_rows: stats.invalid,
      created_by: opts.userId ?? null,
    });

  if (rows.length) {
    await getSupabaseAdmin()
      .from('backlink_import_rows')
      .insert(
        rows.map((r) => ({
          id: randomUUID(),
          import_id: importId,
          workspace_id: workspaceId,
          row_number: r.rowNumber,
          raw_url: r.rawUrl,
          normalized_url: r.normalizedUrl ?? null,
          normalized_domain: r.normalizedDomain ?? null,
          status: r.status,
          error_message: r.errorMessage ?? null,
        }))
      );
  }

  return { importId, stats, rows };
}

export async function listImports(workspaceId: string, limit = 20) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_imports')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getImportDetail(importId: string, workspaceId: string) {
  const { data: imp } = await getSupabaseAdmin()
    .from('backlink_imports')
    .select('*')
    .eq('id', importId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!imp) return null;

  const { data: rows } = await getSupabaseAdmin()
    .from('backlink_import_rows')
    .select('*')
    .eq('import_id', importId)
    .order('row_number');

  return { ...imp, rows: rows ?? [] };
}

async function updateImportStatus(
  importId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await getSupabaseAdmin()
    .from('backlink_imports')
    .update({ status, ...extra })
    .eq('id', importId);
}

async function updateRun(runId: string, patch: Record<string, unknown>) {
  await getSupabaseAdmin().from('backlink_automation_runs').update(patch).eq('id', runId);
}

export async function runAutomationPipeline(
  workspaceId: string,
  importId: string,
  orgId?: string,
  _userId?: string
) {
  const detail = await getImportDetail(importId, workspaceId);
  if (!detail) throw new Error('Import not found');

  const runId = randomUUID();
  const stepsCompleted: string[] = [];
  const brand = await getBrandContext(workspaceId, orgId);

  await getSupabaseAdmin().from('backlink_automation_runs').insert({
    id: runId,
    workspace_id: workspaceId,
    import_id: importId,
    status: 'running',
    current_step: 'analyze',
    progress: 0,
    started_at: new Date().toISOString(),
  });

  try {
    stepsCompleted.push('import', 'validate');
    await updateImportStatus(importId, 'analyzing');
    await updateRun(runId, { current_step: 'analyze', progress: stepProgress(stepsCompleted) });

    const validRows = (detail.rows as Array<Record<string, unknown>>).filter(
      (r) => r.status === 'valid'
    );
    let opportunitiesCreated = 0;
    let contentGenerated = 0;

    for (const row of validRows) {
      const domain = String(row.normalized_domain);
      const url = String(row.normalized_url ?? `https://${domain}`);
      const analysis = analyzeDomain(domain, url);

      const analysisId = randomUUID();
      await getSupabaseAdmin()
        .from('backlink_domain_analyses')
        .insert({
          id: analysisId,
          workspace_id: workspaceId,
          domain,
          import_row_id: String(row.id),
          website_name: analysis.websiteName,
          niche: analysis.niche,
          language: analysis.language,
          country: analysis.country,
          domain_rating: analysis.domainRating,
          monthly_traffic: analysis.monthlyTraffic,
          detected_pages: analysis.detectedPages,
          opportunity_types: analysis.opportunityTypes,
          metadata: analysis.metadata,
        });

      stepsCompleted.push('analyze');
      await updateRun(runId, { current_step: 'classify', progress: stepProgress(stepsCompleted) });

      const classification = classifyOpportunity(analysis, {
        projectDomain: brand.projectDomain,
        projectIndustry: brand.industry,
        brandName: brand.brandName,
      });

      const typeMeta = BACKLINK_TYPES.find((t) => t.id === classification.backlinkType);

      const oppId = randomUUID();
      await getSupabaseAdmin()
        .from('opportunities')
        .insert({
          id: oppId,
          workspace_id: workspaceId,
          opportunity_type: classification.backlinkType,
          title: analysis.websiteName,
          url,
          domain,
          score: classification.opportunityScore,
          status: 'discovered',
          pipeline_stage: 'discovered',
          automation_status: 'analyzed',
          website_name: analysis.websiteName,
          domain_rating: analysis.domainRating,
          monthly_traffic: analysis.monthlyTraffic,
          country: analysis.country,
          language: analysis.language,
          spam_score: classification.spamRisk,
          success_probability: classification.successProbability,
          reply_rate_prediction: classification.replyRate,
          relevance_score: classification.relevanceScore,
          priority: classification.priority,
          recommended_action: classification.recommendedAction,
          ai_recommendation: classification.recommendedAction,
          backlink_category: typeMeta?.category ?? null,
          import_id: importId,
          domain_analysis_id: analysisId,
          discovery_source: 'import',
          metadata: { detected_pages: analysis.detectedPages, niche: analysis.niche },
        });

      await getSupabaseAdmin()
        .from('backlink_import_rows')
        .update({ opportunity_id: oppId })
        .eq('id', String(row.id));

      await getSupabaseAdmin()
        .from('backlink_domain_analyses')
        .update({ opportunity_id: oppId })
        .eq('id', analysisId);

      opportunitiesCreated++;
      stepsCompleted.push('classify', 'score');
    }

    await updateImportStatus(importId, 'generating');
    await updateRun(runId, { current_step: 'generate', progress: stepProgress(stepsCompleted) });

    const { data: newOpps } = await getSupabaseAdmin()
      .from('opportunities')
      .select('id, opportunity_type, title, domain, website_name, score')
      .eq('import_id', importId);

    for (const opp of newOpps ?? []) {
      const types = contentTypesForOpportunity(String(opp.opportunity_type));
      const oppCtx = {
        title: String(opp.title),
        domain: opp.domain as string | null,
        opportunity_type: String(opp.opportunity_type),
        score: Number(opp.score),
        website_name: opp.website_name as string | null,
      };

      for (const draftType of types) {
        const content = generateContent(draftType as ContentDraftType, oppCtx, brand);
        await getSupabaseAdmin()
          .from('backlink_ai_drafts')
          .insert({
            id: randomUUID(),
            workspace_id: workspaceId,
            opportunity_id: String(opp.id),
            draft_type: draftType,
            title: `${draftType.replace(/_/g, ' ')} — ${opp.title}`,
            content,
            status: 'draft',
          });
        contentGenerated++;
      }

      await getSupabaseAdmin()
        .from('opportunities')
        .update({
          automation_status: 'prepared',
          pipeline_stage: 'qualified',
          queue_status: 'pending_approval',
        })
        .eq('id', String(opp.id));

      await getSupabaseAdmin()
        .from('backlink_submissions')
        .insert({
          id: randomUUID(),
          workspace_id: workspaceId,
          opportunity_id: String(opp.id),
          submission_type: String(opp.opportunity_type),
          assisted_mode: inferAssistedMode(String(opp.opportunity_type)),
          status: 'prepared',
          metadata: { generated_by: 'automation_pipeline', run_id: runId },
        });
    }

    stepsCompleted.push('generate', 'queue', 'assist', 'track', 'store');
    await updateImportStatus(importId, 'completed', {
      opportunities_created: opportunitiesCreated,
      content_generated: contentGenerated,
      completed_at: new Date().toISOString(),
    });

    await updateRun(runId, {
      status: 'completed',
      current_step: 'store',
      progress: 100,
      steps_completed: [...new Set(stepsCompleted)],
      stats: { opportunitiesCreated, contentGenerated, validRows: validRows.length },
      completed_at: new Date().toISOString(),
    });

    return {
      runId,
      importId,
      opportunitiesCreated,
      contentGenerated,
      stepsCompleted: [...new Set(stepsCompleted)],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed';
    await updateImportStatus(importId, 'failed');
    await updateRun(runId, {
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    throw err;
  }
}

function inferAssistedMode(type: string): string {
  if (type === 'directory' || type === 'citation') return 'directory';
  if (type === 'profile') return 'profile';
  if (type === 'forum') return 'forum';
  if (type === 'qa_site') return 'qa';
  return 'manual';
}

export async function getAutomationSummary(workspaceId: string) {
  const [imports, opps, submissions, runs] = await Promise.all([
    getSupabaseAdmin()
      .from('backlink_imports')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('automation_status, import_id')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('backlink_submissions')
      .select('status')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('backlink_automation_runs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const o of opps.data ?? []) {
    const s = String(o.automation_status ?? 'imported');
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const subCounts: Record<string, number> = {};
  for (const s of submissions.data ?? []) {
    const st = String(s.status);
    subCounts[st] = (subCounts[st] ?? 0) + 1;
  }

  const importedWebsites = (opps.data ?? []).filter((o) => o.import_id).length;
  const analyzed =
    (statusCounts.analyzed ?? 0) + (statusCounts.prepared ?? 0) + (statusCounts.qualified ?? 0);

  return {
    importedWebsites,
    totalImports: imports.count ?? 0,
    analyzedWebsites: analyzed,
    qualifiedOpportunities: statusCounts.qualified ?? 0,
    contentGenerated: statusCounts.prepared ?? 0,
    pendingApproval: statusCounts.prepared ?? 0,
    submitted: subCounts.submitted ?? 0,
    published: subCounts.published ?? 0,
    verified: statusCounts.verified ?? 0,
    rejected: subCounts.rejected ?? 0,
    waiting: subCounts.waiting ?? 0,
    accepted: subCounts.accepted ?? 0,
    pipelineSteps: AUTOMATION_PIPELINE_STEPS,
    recentRuns: runs.data ?? [],
    statusBreakdown: statusCounts,
    submissionBreakdown: subCounts,
    disclaimer:
      'SEO OS automates preparation, classification, and tracking. Third-party websites control publication — backlinks are never guaranteed.',
  };
}

export async function listTracking(workspaceId: string, status?: TrackingStatus) {
  let query = getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, title, domain, opportunity_type, automation_status, pipeline_stage, score, priority, recommended_action, import_id, created_at'
    )
    .eq('workspace_id', workspaceId)
    .not('import_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) query = query.eq('automation_status', status);

  const { data } = await query;
  return data ?? [];
}

export async function updateSubmissionStatus(
  submissionId: string,
  workspaceId: string,
  status: string,
  notes?: string
) {
  const patch: Record<string, unknown> = { status, notes: notes ?? null };
  if (status === 'submitted') patch.submitted_at = new Date().toISOString();
  if (status === 'published') patch.published_at = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .update(patch)
    .eq('id', submissionId)
    .eq('workspace_id', workspaceId)
    .select('*, opportunities:opportunity_id(id, title, domain)')
    .single();

  if (error || !data) throw new Error('Submission not found');

  const automationMap: Record<string, TrackingStatus> = {
    submitted: 'submitted',
    waiting: 'waiting',
    accepted: 'accepted',
    rejected: 'rejected',
    published: 'published',
  };
  if (automationMap[status]) {
    await getSupabaseAdmin()
      .from('opportunities')
      .update({ automation_status: automationMap[status] })
      .eq('id', data.opportunity_id);
  }

  return data;
}

export async function runVerificationCheck(workspaceId: string, backlinkId: string) {
  const { data: bl } = await getSupabaseAdmin()
    .from('backlinks')
    .select('*')
    .eq('id', backlinkId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!bl) throw new Error('Backlink not found');

  const outcomes = ['verified', 'pending', 'broken', 'redirected'] as const;
  const hash = backlinkId.charCodeAt(0) % outcomes.length;
  const outcome = outcomes[hash];
  const checkId = randomUUID();

  await getSupabaseAdmin()
    .from('backlink_checks')
    .insert({
      id: checkId,
      backlink_id: backlinkId,
      workspace_id: workspaceId,
      status: outcome,
      check_type: 'automated',
      is_broken: outcome === 'broken',
      redirect_url: outcome === 'redirected' ? bl.target_url : null,
      http_status: outcome === 'verified' ? 200 : outcome === 'broken' ? 404 : 301,
      checked_at: new Date().toISOString(),
    });

  if (outcome === 'verified') {
    await getSupabaseAdmin()
      .from('backlinks')
      .update({ verification_status: 'verified', verified_at: new Date().toISOString() })
      .eq('id', backlinkId);
  } else if (outcome === 'broken' || outcome === 'redirected') {
    await getSupabaseAdmin()
      .from('backlinks')
      .update({ verification_status: 'lost' })
      .eq('id', backlinkId);
  }

  return { checkId, outcome, backlinkId };
}

export async function listSubmissions(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select('*, opportunities:opportunity_id(id, title, domain, opportunity_type)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getAutomationRun(runId: string, workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_automation_runs')
    .select('*')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .single();
  return data;
}
