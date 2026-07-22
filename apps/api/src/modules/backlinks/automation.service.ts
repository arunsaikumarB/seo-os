import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  BACKLINK_TYPES,
  analyzeDomainLive,
  AUTOMATION_PIPELINE_STEPS,
  classifyOpportunity,
  qualifyOpportunity,
  formatQualificationReport,
  contentTypesForOpportunity,
  deduplicateAndValidate,
  extractUrlsFromCsv,
  extractUrlsFromSheetRows,
  extractUrlsFromText,
  generateContent,
  inspectBacklinkHtml,
  buildPrefillPayload,
  estimateApprovalHours,
  estimateReviewHours,
  type BrandContext,
  type ContentDraftType,
  type ImportSourceType,
  type QualificationResult,
  type RichImportRow,
  type TrackingStatus,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { listMemory, createMemoryEntry, createMemoryFact } from '../memory/memory.service.js';
import { startBrowserIntelligenceScan, executeBrowserIntelligenceScan } from '../intelligence/browser-intelligence.service.js';
import { uploadDocument } from '../knowledge/document.service.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { loadClassificationLearning } from './classification.service.js';
import { summarizeClassificationCounts } from '@seo-os/backlink-builder';

type WriteResult = { error: unknown; data?: unknown };

function writeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? 'unknown write error');
}

async function requireWrite(stage: string, result: WriteResult): Promise<void> {
  if (result.error) {
    throw Object.assign(new Error(`${stage}: ${writeErrorMessage(result.error)}`), {
      code: 'PIPELINE_WRITE_FAILED',
      stage,
    });
  }
}

async function appendRunLog(params: {
  workspaceId: string;
  runId: string;
  importId?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  detail?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabaseAdmin().from('backlink_automation_run_logs').insert({
    id: randomUUID(),
    workspace_id: params.workspaceId,
    run_id: params.runId,
    import_id: params.importId ?? null,
    level: params.level ?? 'info',
    stage: params.stage,
    message: params.message,
    detail: params.detail ?? {},
  });
  if (error) {
    const msg = writeErrorMessage(error);
    logger.warn({ err: error, runId: params.runId }, 'automation run log insert failed');
    return { ok: false, error: msg };
  }
  return { ok: true };
}

async function emitAutomationEvent(params: {
  workspaceId: string;
  orgId?: string;
  userId?: string;
  eventType: string;
  title: string;
  summary?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  severity?: 'info' | 'success' | 'warning' | 'failure';
}) {
  await publishPlatformEvent({
    workspaceId: params.workspaceId,
    orgId: params.orgId ?? null,
    sourceModule: 'backlink_automation',
    eventType: params.eventType,
    title: params.title,
    summary: params.summary,
    severity: params.severity ?? 'info',
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload,
    actorId: params.userId ?? null,
  });
}

function progressFromStages(steps: Set<string>): number {
  const ordered = AUTOMATION_PIPELINE_STEPS.map((s) => s.id);
  if (ordered.length === 0) return 0;
  const done = ordered.filter((id) => steps.has(id)).length;
  return Math.min(100, Math.round((done / ordered.length) * 100));
}

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

function looksLikeBase64(content: string): boolean {
  const trimmed = content.trim().replace(/^data:[^;]+;base64,/, '');
  return trimmed.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 200));
}

async function parseExcelBuffer(buf: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings accept Buffer via ArrayBuffer-like
  await workbook.xlsx.load(buf as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v))));
  });
  return extractUrlsFromSheetRows(rows);
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
  if (sourceType === 'csv') {
    return extractUrlsFromCsv(content);
  }
  if (sourceType === 'excel') {
    if (looksLikeBase64(content)) {
      const raw = content.trim().replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      return parseExcelBuffer(buf);
    }
    // Client may already extract URLs into newline/CSV text
    return extractUrlsFromCsv(content);
  }
  return extractUrlsFromText(content);
}

export async function createImport(
  workspaceId: string,
  sourceType: ImportSourceType,
  urls: string[],
  opts: { fileName?: string; userId?: string; richRows?: RichImportRow[] } = {}
) {
  const { rows, stats } = deduplicateAndValidate(urls);
  const importId = randomUUID();

  const richByUrl = new Map<string, RichImportRow>();
  for (const r of opts.richRows ?? []) {
    const key = r.url.trim().toLowerCase();
    if (key) richByUrl.set(key, r);
  }

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
      metadata: {
        richColumns: Boolean(opts.richRows?.length),
        richRowCount: opts.richRows?.length ?? 0,
        richByUrl: Object.fromEntries(
          [...richByUrl.entries()].map(([k, v]) => [
            k,
            {
              keywords: v.keywords ?? null,
              description: v.description ?? null,
              anchorText: v.anchorText ?? null,
              targetPage: v.targetPage ?? null,
              businessInfo: v.businessInfo ?? null,
              notes: v.notes ?? null,
              images: v.images ?? null,
              videos: v.videos ?? null,
            },
          ])
        ),
      },
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

  return { importId, stats, rows, richMapped: richByUrl.size };
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
  userId?: string
) {
  const detail = await getImportDetail(importId, workspaceId);
  if (!detail) throw new Error('Import not found');

  const runId = randomUUID();
  const steps = new Set<string>();
  const brand = await getBrandContext(workspaceId, orgId);
  const stageErrors: Array<{ stage: string; domain?: string; message: string }> = [];
  const qualificationReport: QualificationResult[] = [];
  let logWriteFailures = 0;

  const { error: runInsertErr } = await getSupabaseAdmin().from('backlink_automation_runs').insert({
    id: runId,
    workspace_id: workspaceId,
    import_id: importId,
    status: 'running',
    current_step: 'validate',
    progress: 0,
    started_at: new Date().toISOString(),
  });
  await requireWrite('create_run', { error: runInsertErr });

  const log = async (
    stage: string,
    message: string,
    opts: { level?: 'debug' | 'info' | 'warn' | 'error'; detail?: Record<string, unknown> } = {}
  ) => {
    const result = await appendRunLog({
      workspaceId,
      runId,
      importId,
      stage,
      message,
      level: opts.level,
      detail: opts.detail,
    });
    if (!result.ok) logWriteFailures++;
  };

  const bump = async (step: string, currentStep: string) => {
    steps.add(step);
    await updateRun(runId, {
      current_step: currentStep,
      progress: progressFromStages(steps),
      steps_completed: [...steps],
    });
  };

  try {
    await log('import', `Importing URLs from import ${importId.slice(0, 8)}…`);
    steps.add('import');
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'website_imported',
      title: 'Websites imported',
      entityType: 'backlink_import',
      entityId: importId,
      payload: { importId },
    });

    const validRows = (detail.rows as Array<Record<string, unknown>>).filter(
      (r) => r.status === 'valid'
    );
    await log('validate', `Validated ${validRows.length} of ${detail.rows?.length ?? 0} URLs`);
    await bump('validate', 'analyze');
    await updateImportStatus(importId, 'analyzing');
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'website_validated',
      title: 'Import validated',
      summary: `${validRows.length} valid URLs ready for analysis`,
      entityType: 'backlink_import',
      entityId: importId,
      payload: { valid: validRows.length },
    });

    if (validRows.length === 0) {
      await log('validate', 'No valid URLs to process', { level: 'error' });
      await updateImportStatus(importId, 'failed');
      await updateRun(runId, {
        status: 'failed',
        progress: progressFromStages(steps),
        error_message: 'No valid URLs in import',
        steps_completed: [...steps],
        completed_at: new Date().toISOString(),
      });
      throw new Error('No valid URLs in import');
    }

    const importMeta = (detail.metadata ?? {}) as {
      richByUrl?: Record<string, Record<string, string | null>>;
    };
    const richByUrl = importMeta.richByUrl ?? {};
    let opportunitiesCreated = 0;
    let analysesCreated = 0;
    let contentGenerated = 0;
    let submissionsCreated = 0;
    let relationshipsCreated = 0;
    const classificationDecisions: Array<{
      classificationId: string;
      displayName?: string;
      confidence: number;
      reason: string;
      domain: string;
      queue: string;
      agent: string;
    }> = [];
    const learning = await loadClassificationLearning(workspaceId);

    const CONCURRENCY = 5;
    for (let i = 0; i < validRows.length; i += CONCURRENCY) {
      const batch = validRows.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (row) => {
          const domain = String(row.normalized_domain);
          const url = String(row.normalized_url ?? `https://${domain}`);
          const rich =
            richByUrl[String(row.raw_url ?? '').toLowerCase()] ??
            richByUrl[url.toLowerCase()] ??
            {};

          try {
            await log('analyze', `Scanning homepage — ${domain}`);
            await log('analyze', `Fetching robots.txt — ${domain}`, { level: 'debug' });
            const analysis = await analyzeDomainLive(domain, url, fetch, { learning });
            await log(
              'analyze',
              `Analyzed ${domain} (DR ${analysis.domainRating ?? 'n/a'}, robots ${analysis.robotsTxtStatus ?? 'n/a'})`
            );

            const analysisId = randomUUID();
            const analysisInsert = await getSupabaseAdmin()
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
                metrics_source: analysis.metricsSource,
                robots_txt_status: analysis.robotsTxtStatus ?? null,
                sitemap_found: analysis.sitemapFound ?? null,
                fetch_status_code: analysis.fetchStatusCode ?? null,
              });
            await requireWrite(`analyze:${domain}`, analysisInsert);
            analysesCreated++;

            await log('classify', `Classifying opportunity — ${domain}`);
            const classification = classifyOpportunity(analysis, {
              projectDomain: brand.projectDomain,
              projectIndustry: brand.industry,
              brandName: brand.brandName,
              learning,
            });
            classificationDecisions.push({
              classificationId: classification.classificationId,
              displayName: classification.classificationLabel,
              confidence: classification.confidence,
              reason: classification.reason,
              domain,
              queue: String(classification.workflowQueue),
              agent: String(classification.assignedAgent),
            });
            const typeMeta = BACKLINK_TYPES.find((t) => t.id === classification.backlinkType);
            await log(
              'score',
              `${classification.classificationLabel} (${classification.confidence}%) — ${classification.reason} · Score ${classification.opportunityScore} — ${domain}`
            );

            const qualification = qualifyOpportunity(analysis, classification);
            qualificationReport.push(qualification);
            await log(
              'classify',
              `${qualification.websiteName}\nClassification:\n${qualification.classificationLabel}\nScore: ${qualification.score}\nQualified: ${qualification.qualified ? 'YES' : 'NO'}${
                qualification.qualified ? '' : `\nReason:\n${qualification.reason}`
              }`,
              {
                level: qualification.qualified ? 'info' : 'warn',
                detail: {
                  domain,
                  qualified: qualification.qualified,
                  reason: qualification.reason,
                  score: qualification.score,
                  type: qualification.backlinkType,
                  label: qualification.classificationLabel,
                  signals: qualification.signals,
                  confidence: classification.confidence,
                  classificationReason: classification.reason,
                  workflowQueue: classification.workflowQueue,
                  assignedAgent: classification.assignedAgent,
                },
              }
            );

            if (!qualification.qualified) {
              // Campaign State Manager: still create one Campaign Item per valid import
              const ignoredId = randomUUID();
              await getSupabaseAdmin()
                .from('opportunities')
                .insert({
                  id: ignoredId,
                  workspace_id: workspaceId,
                  opportunity_type: classification.backlinkType,
                  title: analysis.websiteName,
                  url,
                  domain,
                  score: classification.opportunityScore,
                  status: 'dismissed',
                  pipeline_stage: 'lost',
                  automation_status: 'analyzed',
                  campaign_lifecycle: 'Ignored',
                  campaign_step: 'ai-review',
                  website_name: analysis.websiteName,
                  domain_rating: analysis.domainRating,
                  monthly_traffic: analysis.monthlyTraffic,
                  import_id: importId,
                  domain_analysis_id: analysisId,
                  discovery_source: 'import',
                  queue_status: 'archived',
                  last_error: qualification.reason ?? 'Not qualified',
                  metadata: {
                    qualification: {
                      qualified: false,
                      reason: qualification.reason,
                    },
                    classification: {
                      id: classification.classificationId,
                      displayName: classification.classificationLabel,
                      confidence: classification.confidence,
                      reason: classification.reason,
                    },
                  },
                })
                .then((r) => {
                  if (!r.error) opportunitiesCreated++;
                });
              await getSupabaseAdmin()
                .from('backlink_import_rows')
                .update({ opportunity_id: ignoredId })
                .eq('id', row.id);

              await emitAutomationEvent({
                workspaceId,
                orgId,
                userId,
                eventType: 'website_analyzed',
                title: `Analyzed ${domain} — not qualified`,
                severity: 'warning',
                entityType: 'backlink_domain_analysis',
                entityId: analysisId,
                payload: {
                  domain,
                  score: classification.opportunityScore,
                  qualified: false,
                  reason: qualification.reason,
                  classification: classification.classificationId,
                  confidence: classification.confidence,
                },
              });
              return;
            }

            const oppId = randomUUID();
            const oppInsert = await getSupabaseAdmin().from('opportunities').insert({
              id: oppId,
              workspace_id: workspaceId,
              opportunity_type: classification.backlinkType,
              title: analysis.websiteName,
              url,
              domain,
              score: classification.opportunityScore,
              status: 'qualified',
              pipeline_stage: 'qualified',
              automation_status: 'qualified',
              campaign_lifecycle: 'Classified',
              campaign_step: 'ai-review',
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
              authority_estimated: true,
              traffic_estimated: true,
              metrics_source: analysis.metricsSource === 'live' ? 'live' : 'estimated',
              queue_status: 'pending_review',
              metadata: {
                detected_pages: analysis.detectedPages,
                niche: analysis.niche,
                difficulty: classification.difficulty,
                estimated: analysis.metricsSource !== 'live',
                importEnrichment: rich,
                cms: (analysis.metadata as Record<string, unknown>)?.cms ?? null,
                websiteSignals: analysis.websiteSignals
                  ? { ...analysis.websiteSignals, rawSnippet: undefined }
                  : null,
                classification: {
                  id: classification.classificationId,
                  displayName: classification.classificationLabel,
                  confidence: classification.confidence,
                  reason: classification.reason,
                  evidence: classification.evidence,
                  workflowQueue: classification.workflowQueue,
                  assignedAgent: classification.assignedAgent,
                  alternatives: classification.alternatives,
                },
                assignedAgent: classification.assignedAgent,
                workflowQueue: classification.workflowQueue,
                qualification: {
                  qualified: true,
                  reason: qualification.reason,
                  label: qualification.classificationLabel,
                  signals: qualification.signals,
                },
                metrics_labels: {
                  domain_rating: analysis.metricsSource === 'live' ? 'Live' : 'Estimated',
                  monthly_traffic: 'Estimated',
                  success_probability: 'Estimated',
                  difficulty: 'Estimated',
                },
              },
            });
            await requireWrite(`opportunity:${domain}`, oppInsert);
            opportunitiesCreated++;

            await requireWrite(
              `link_row:${domain}`,
              await getSupabaseAdmin()
                .from('backlink_import_rows')
                .update({ opportunity_id: oppId })
                .eq('id', String(row.id))
            );
            await requireWrite(
              `link_analysis:${domain}`,
              await getSupabaseAdmin()
                .from('backlink_domain_analyses')
                .update({ opportunity_id: oppId })
                .eq('id', analysisId)
            );

            await emitAutomationEvent({
              workspaceId,
              orgId,
              userId,
              eventType: 'website_analyzed',
              title: `Analyzed ${domain}`,
              entityType: 'opportunity',
              entityId: oppId,
              payload: { domain, score: classification.opportunityScore, qualified: true },
            });
            await emitAutomationEvent({
              workspaceId,
              orgId,
              userId,
              eventType: 'opportunity_created',
              title: `Qualified opportunity — ${domain}`,
              severity: 'success',
              entityType: 'opportunity',
              entityId: oppId,
              payload: {
                domain,
                type: classification.backlinkType,
                classificationId: classification.classificationId,
                confidence: classification.confidence,
                workflowQueue: classification.workflowQueue,
                assignedAgent: classification.assignedAgent,
                priority: classification.priority,
                score: classification.opportunityScore,
                qualificationReason: qualification.reason,
              },
            });
            await log('store', `Created qualified opportunity for ${domain}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stageErrors.push({ stage: 'analyze_classify', domain, message });
            await log('analyze', `Failed ${domain}: ${message}`, {
              level: 'error',
              detail: { domain, message },
            });
          }
        })
      );

      await bump('analyze', 'classify');
      await bump('classify', 'score');
      await bump('score', 'generate');
      await updateRun(runId, {
        stats: {
          opportunitiesCreated,
          analysesCreated,
          qualified: qualificationReport.filter((r) => r.qualified).length,
          rejected: qualificationReport.filter((r) => !r.qualified).length,
          processed: Math.min(i + batch.length, validRows.length),
          total: validRows.length,
          errors: stageErrors.length,
          logWriteFailures,
          classificationSummary: summarizeClassificationCounts(classificationDecisions),
        },
      });
    }

    const classificationSummary = summarizeClassificationCounts(classificationDecisions);
    await updateImportStatus(importId, detail.status === 'failed' ? 'failed' : 'analyzing', {
      metadata: {
        ...((detail.metadata as Record<string, unknown>) ?? {}),
        classificationSummary: {
          imported: validRows.length,
          classified: classificationDecisions.length,
          byType: classificationSummary,
          samples: classificationDecisions.slice(0, 40).map((d) => ({
            domain: d.domain,
            type: d.classificationId,
            label: d.displayName,
            confidence: d.confidence,
            reason: d.reason,
            queue: d.queue,
            agent: d.agent,
          })),
        },
      },
    });

    const reportText = formatQualificationReport(qualificationReport);
    await log('classify', `Qualification report\n\n${reportText}`, {
      detail: { qualificationReport, classificationSummary },
    });
    await log(
      'classify',
      `Classification summary — ${classificationSummary.map((t) => `${t.label}: ${t.count}`).join(' · ') || 'none'}`
    );
    if (opportunitiesCreated === 0) {
      const rejectedReasons = qualificationReport
        .filter((r) => !r.qualified)
        .reduce<Record<string, number>>((acc, r) => {
          acc[r.reason] = (acc[r.reason] ?? 0) + 1;
          return acc;
        }, {});
      const msg =
        qualificationReport.length > 0
          ? `No opportunities qualified (${qualificationReport.length} classified, 0 qualified). Reasons: ${JSON.stringify(rejectedReasons)}`
          : `No opportunities persisted (${stageErrors.length} row failures)`;
      await log('store', msg, {
        level: 'error',
        detail: { stageErrors, qualificationReport, rejectedReasons },
      });
      await updateImportStatus(importId, 'failed');
      await updateRun(runId, {
        status: 'failed',
        progress: progressFromStages(steps),
        error_message: msg,
        steps_completed: [...steps],
        stats: {
          opportunitiesCreated: 0,
          analysesCreated,
          qualificationReport,
          rejectedReasons,
          errors: stageErrors,
          logWriteFailures,
        },
        completed_at: new Date().toISOString(),
      });
      await emitAutomationEvent({
        workspaceId,
        orgId,
        userId,
        eventType: 'automation_pipeline_failed',
        title: 'Automation pipeline failed',
        summary: msg,
        severity: 'failure',
        entityType: 'backlink_import',
        entityId: importId,
      });
      throw new Error(msg);
    }

    await updateImportStatus(importId, 'generating');
    await log('generate', `Generating outreach drafts for ${opportunitiesCreated} opportunities…`);

    const { data: newOpps, error: oppFetchErr } = await getSupabaseAdmin()
      .from('opportunities')
      .select('id, opportunity_type, title, domain, website_name, score, country, language, url')
      .eq('import_id', importId)
      .eq('workspace_id', workspaceId);
    await requireWrite('fetch_opportunities', { error: oppFetchErr, data: newOpps });

    for (const opp of newOpps ?? []) {
      const types = contentTypesForOpportunity(String(opp.opportunity_type));
      const oppCtx = {
        title: String(opp.title),
        domain: opp.domain as string | null,
        opportunity_type: String(opp.opportunity_type),
        score: Number(opp.score),
        website_name: opp.website_name as string | null,
      };

      let firstDraftId: string | null = null;
      for (const draftType of types) {
        const content = generateContent(draftType as ContentDraftType, oppCtx, brand);
        const draftId = randomUUID();
        const draftInsert = await getSupabaseAdmin().from('backlink_ai_drafts').insert({
          id: draftId,
          workspace_id: workspaceId,
          opportunity_id: String(opp.id),
          draft_type: draftType,
          title: `${draftType.replace(/_/g, ' ')} — ${opp.title}`,
          content,
          status: 'draft',
        });
        await requireWrite(`draft:${opp.domain}:${draftType}`, draftInsert);
        contentGenerated++;
        if (!firstDraftId) firstDraftId = draftId;
        await emitAutomationEvent({
          workspaceId,
          orgId,
          userId,
          eventType: 'draft_generated',
          title: `Draft generated — ${draftType}`,
          entityType: 'backlink_ai_draft',
          entityId: draftId,
          payload: { opportunityId: opp.id, draftType },
        });
      }

      await log('generate', `Generated drafts for ${opp.domain}`);

      const prepUpdate = await getSupabaseAdmin()
        .from('opportunities')
        .update({
          automation_status: 'prepared',
          pipeline_stage: 'qualified',
          queue_status: 'pending_review',
          status: 'qualified',
        })
        .eq('id', String(opp.id));
      await requireWrite(`prepare:${opp.domain}`, prepUpdate);

      const submissionId = randomUUID();
      const subInsert = await getSupabaseAdmin().from('backlink_submissions').insert({
        id: submissionId,
        workspace_id: workspaceId,
        opportunity_id: String(opp.id),
        submission_type: String(opp.opportunity_type),
        assisted_mode: inferAssistedMode(String(opp.opportunity_type)),
        status: 'prepared',
        tracking_status: 'ready',
        queue_stage: 'prepared',
        estimated_review_hours: estimateReviewHours(String(opp.opportunity_type)),
        estimated_approval_hours: estimateApprovalHours(String(opp.opportunity_type)),
        prefill_payload: buildPrefillPayload({
          brandName: brand.brandName,
          projectDomain: brand.projectDomain,
          industry: brand.industry,
          opportunityTitle: String(opp.title),
          opportunityDomain: String(opp.domain ?? ''),
          opportunityType: String(opp.opportunity_type),
        }),
        metadata: {
          generated_by: 'automation_pipeline',
          run_id: runId,
          draft_id: firstDraftId,
        },
      });
      await requireWrite(`submission:${opp.domain}`, subInsert);
      submissionsCreated++;
      await emitAutomationEvent({
        workspaceId,
        orgId,
        userId,
        eventType: 'submission_created',
        title: `Submission queued — ${opp.domain}`,
        severity: 'success',
        entityType: 'backlink_submission',
        entityId: submissionId,
        payload: { opportunityId: opp.id, draftId: firstDraftId },
      });
      await log('queue', `Submission queue entry for ${opp.domain}`);
    }

    await bump('generate', 'queue');
    await bump('queue', 'assist');
    await bump('assist', 'track');

    // Relationships (required for completion)
    await log('store', 'Creating relationship organizations and contacts…');
    for (const opp of newOpps ?? []) {
      const domain = String(opp.domain ?? '');
      if (!domain) continue;
      const { data: existing } = await getSupabaseAdmin()
        .from('relationship_organizations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('domain', domain)
        .maybeSingle();

      let relOrgId = existing?.id as string | undefined;
      if (!relOrgId) {
        relOrgId = randomUUID();
        const orgInsert = await getSupabaseAdmin().from('relationship_organizations').insert({
          id: relOrgId,
          workspace_id: workspaceId,
          company_name: String(opp.website_name ?? domain),
          domain,
          website: opp.url ?? `https://${domain}`,
          country: opp.country ?? 'US',
          language: opp.language ?? 'en',
          relationship_score: Math.min(100, Math.round(Number(opp.score ?? 40))),
          priority_score: Math.min(100, Math.round(Number(opp.score ?? 40))),
          response_probability: Math.min(90, Math.round(Number(opp.score ?? 40) * 0.7)),
          campaign_suitability: Math.min(100, Math.round(Number(opp.score ?? 40))),
          warmth: 'cold',
          notes: 'Auto-created from automation pipeline',
          metadata: {
            source: 'backlink_import',
            opportunity_id: opp.id,
            next_action: 'Review opportunity and approve outreach',
          },
        });
        await requireWrite(`relationship_org:${domain}`, orgInsert);
        relationshipsCreated++;
      }

      const contactId = randomUUID();
      const contactInsert = await getSupabaseAdmin().from('relationship_contacts').insert({
        id: contactId,
        workspace_id: workspaceId,
        organization_id: relOrgId,
        name: `Editorial team — ${domain}`,
        role: 'Editor',
        department: 'Editorial',
        preferred_contact_method: 'form',
        confidence_score: 40,
        is_recommended_outreach: Number(opp.score ?? 0) >= 50,
        metadata: {
          source: 'automation_pipeline',
          note: 'Placeholder contact from public site profile — enrich before outreach',
        },
      });
      await requireWrite(`relationship_contact:${domain}`, contactInsert);

      const timelineInsert = await getSupabaseAdmin().from('relationship_timeline').insert({
        id: randomUUID(),
        workspace_id: workspaceId,
        organization_id: relOrgId,
        contact_id: contactId,
        event_type: 'organization_enriched',
        title: `Organization seeded from import`,
        description: `Opportunity ${opp.title} scored ${opp.score}. Next: review in Opportunity Queue.`,
        metadata: { opportunity_id: opp.id, run_id: runId },
        actor_id: userId ?? null,
      });
      await requireWrite(`relationship_timeline:${domain}`, timelineInsert);

      await requireWrite(
        `backlink_relationship:${domain}`,
        await getSupabaseAdmin().from('backlink_relationships').upsert(
          {
            workspace_id: workspaceId,
            domain,
            organization_id: relOrgId,
            warmth: 'cold',
            opportunity_count: 1,
            notes: `Seeded from import ${importId.slice(0, 8)}`,
          },
          { onConflict: 'workspace_id,domain' }
        )
      );

      await emitAutomationEvent({
        workspaceId,
        orgId,
        userId,
        eventType: 'relationship_created',
        title: `Relationship seeded — ${domain}`,
        entityType: 'relationship_organization',
        entityId: relOrgId,
        payload: { domain, contactId },
      });
    }
    await log('store', `Relationships saved (${relationshipsCreated} new orgs)`);

    await bump('track', 'store');
    steps.add('store');
    steps.add('verify');

    const analytics = await refreshAutomationAnalytics(workspaceId);
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'analytics_updated',
      title: 'Automation analytics updated',
      payload: analytics,
    });
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'mission_control_updated',
      title: 'Mission Control refresh',
      severity: 'success',
      payload: { importId, runId },
    });
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'report_updated',
      title: 'Reports data refreshed',
      payload: { importId, opportunitiesCreated },
    });
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'dashboard_updated',
      title: 'Dashboard counters refreshed',
      payload: analytics,
    });

    const partial = stageErrors.length > 0 || opportunitiesCreated < validRows.length;
    const finalStatus = partial ? 'partially_completed' : 'completed';
    await updateImportStatus(importId, finalStatus === 'partially_completed' ? 'completed' : finalStatus, {
      opportunities_created: opportunitiesCreated,
      content_generated: contentGenerated,
      completed_at: new Date().toISOString(),
    });

    await updateRun(runId, {
      status: finalStatus,
      current_step: 'store',
      progress: 100,
      steps_completed: [...steps],
      stats: {
        opportunitiesCreated,
        analysesCreated,
        contentGenerated,
        submissionsCreated,
        relationshipsCreated,
        validRows: validRows.length,
        qualified: qualificationReport.filter((r) => r.qualified).length,
        rejected: qualificationReport.filter((r) => !r.qualified).length,
        qualificationReport,
        classificationSummary: summarizeClassificationCounts(classificationDecisions),
        errors: stageErrors,
        logWriteFailures,
      },
      error_message: partial
        ? `${stageErrors.length} domain(s) failed — see run logs`
        : logWriteFailures > 0
          ? `Completed with ${logWriteFailures} log write failure(s)`
          : null,
      completed_at: new Date().toISOString(),
    });

    await log(
      'store',
      partial
        ? `Completed with partial success: ${opportunitiesCreated}/${validRows.length} opportunities (${qualificationReport.filter((r) => !r.qualified).length} not qualified)`
        : `Completed successfully: ${opportunitiesCreated} opportunities, ${contentGenerated} drafts, ${submissionsCreated} submissions`,
      { level: partial ? 'warn' : 'info' }
    );

    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'automation_pipeline_completed',
      title: partial ? 'Automation partially completed' : 'Automation completed',
      severity: partial ? 'warning' : 'success',
      entityType: 'backlink_import',
      entityId: importId,
      payload: {
        runId,
        opportunitiesCreated,
        contentGenerated,
        submissionsCreated,
        relationshipsCreated,
      },
    });

    // Non-blocking enrichment only (memory/knowledge/browser) — core data already persisted
    fireAndForget(
      triggerBackgroundEnginesAfterImport({
        workspaceId,
        importId,
        orgId,
        userId,
        opportunitiesCreated,
        domains: validRows
          .map((r) => String(r.normalized_domain ?? ''))
          .filter(Boolean)
          .slice(0, 8),
      })
    );

    return {
      runId,
      importId,
      opportunitiesCreated,
      contentGenerated,
      submissionsCreated,
      relationshipsCreated,
      analysesCreated,
      stepsCompleted: [...steps],
      status: finalStatus,
      errors: stageErrors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed';
    await log('store', `Pipeline failed: ${message}`, { level: 'error' });
    await updateImportStatus(importId, 'failed');
    await updateRun(runId, {
      status: 'failed',
      error_message: message,
      steps_completed: [...steps],
      progress: progressFromStages(steps),
      completed_at: new Date().toISOString(),
    });
    await emitAutomationEvent({
      workspaceId,
      orgId,
      userId,
      eventType: 'automation_pipeline_failed',
      title: 'Automation pipeline failed',
      summary: message,
      severity: 'failure',
      entityType: 'backlink_import',
      entityId: importId,
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

/**
 * Optional background enrichment only — core relationships already written in the main pipeline.
 */
async function triggerBackgroundEnginesAfterImport(opts: {
  workspaceId: string;
  importId: string;
  orgId?: string;
  userId?: string;
  opportunitiesCreated: number;
  domains: string[];
}) {
  const { workspaceId, importId, userId, opportunitiesCreated, domains } = opts;
  try {
    if (userId) {
      await createMemoryEntry(workspaceId, userId, {
        tier: 'project',
        content: `Imported and analyzed ${opportunitiesCreated} website(s) for backlink opportunities (import ${importId.slice(0, 8)}). Domains: ${domains.slice(0, 5).join(', ') || 'none'}.`,
        metadata: { source: 'backlink_import', importId, opportunitiesCreated },
      });
      await createMemoryFact(workspaceId, {
        factType: 'project',
        content: `Latest import created ${opportunitiesCreated} backlink opportunities ready for outreach qualification.`,
      });
    }
  } catch (err) {
    logger.warn({ err, workspaceId, importId }, 'background memory write skipped');
  }

  try {
    if (userId) {
      const lines = [
        `# Backlink import summary`,
        ``,
        `Import ID: ${importId}`,
        `Opportunities created: ${opportunitiesCreated}`,
        `Domains analyzed:`,
        ...domains.map((d) => `- ${d}`),
      ].join('\n');
      await uploadDocument(workspaceId, userId, {
        title: `Import analysis ${new Date().toISOString().slice(0, 10)}`,
        content: lines,
        filename: `import-${importId.slice(0, 8)}.md`,
        mimeType: 'text/plain',
      });
    }
  } catch (err) {
    logger.warn({ err, workspaceId, importId }, 'background knowledge upload skipped');
  }

  if (userId) {
    for (const domain of domains.slice(0, 3)) {
      const targetUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      try {
        const scan = await startBrowserIntelligenceScan(workspaceId, userId, targetUrl);
        fireAndForget(
          executeBrowserIntelligenceScan(String(scan.id), workspaceId, opts.orgId).then(() =>
            logger.info({ workspaceId, domain, scanId: scan.id }, 'background browser scan finished')
          )
        );
      } catch (err) {
        logger.warn({ err, workspaceId, domain }, 'background browser scan skipped');
      }
    }
  }
}

export async function listAutomationRunLogs(workspaceId: string, runId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlink_automation_run_logs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function refreshAutomationAnalytics(workspaceId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const safeCount = async (fn: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await fn();
      if (error) return 0;
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    imported_websites,
    analyzed_websites,
    qualified_opportunities,
    generated_drafts,
    submissions,
    relationships,
    verified_backlinks,
    campaigns,
  ] = await Promise.all([
    safeCount(() =>
      getSupabaseAdmin()
        .from('backlink_import_rows')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'valid')
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('backlink_domain_analyses')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .not('import_id', 'is', null)
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('backlink_ai_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('backlink_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('relationship_organizations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('backlink_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('queue_stage', 'verified')
    ),
    safeCount(() =>
      getSupabaseAdmin()
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
    ),
  ]);

  const { data: pendingRows } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('queue_status', 'pending_review');
  const pending_approvals = pendingRows?.length ?? 0;

  const snapshot = {
    imported_websites,
    analyzed_websites,
    qualified_opportunities,
    generated_drafts,
    pending_approvals,
    relationships,
    submissions,
    verified_backlinks,
    campaigns,
  };

  const upsert = await getSupabaseAdmin().from('backlink_automation_analytics').upsert(
    {
      workspace_id: workspaceId,
      day,
      ...snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,day' }
  );
  if (upsert.error) {
    logger.warn({ err: upsert.error }, 'automation analytics upsert skipped');
  }

  return snapshot;
}

export async function getAutomationSummary(workspaceId: string) {
  const analytics = await refreshAutomationAnalytics(workspaceId).catch(async () => {
    // Analytics table may not exist until migration 082 — fall back to live counts
    return null;
  });

  const { getCampaignCounts, projectAutomationSummaryFromCounts } = await import(
    '../campaigns/campaign-state.service.js'
  );
  const counts = await getCampaignCounts(workspaceId);
  const fromCsm = projectAutomationSummaryFromCounts(counts);

  const [submissions, runs, drafts] = await Promise.all([
    getSupabaseAdmin()
      .from('backlink_submissions')
      .select('status, queue_stage')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('backlink_automation_runs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),
    getSupabaseAdmin()
      .from('backlink_ai_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
  ]);

  const subCounts: Record<string, number> = {};
  for (const s of submissions.data ?? []) {
    const st = String(s.status);
    subCounts[st] = (subCounts[st] ?? 0) + 1;
  }

  return {
    importedWebsites: fromCsm.importedWebsites,
    totalImports: fromCsm.totalImports,
    analyzedWebsites: fromCsm.analyzedWebsites,
    qualifiedOpportunities: fromCsm.qualifiedOpportunities,
    contentGenerated: analytics?.generated_drafts ?? drafts.count ?? fromCsm.contentGenerated,
    pendingApproval: fromCsm.pendingApproval,
    submitted: fromCsm.submitted || (subCounts.submitted ?? 0),
    published: subCounts.published ?? fromCsm.published,
    verified: fromCsm.verified,
    rejected: fromCsm.rejected || (subCounts.rejected ?? 0),
    waiting: fromCsm.waiting || (subCounts.waiting ?? 0),
    accepted: subCounts.accepted ?? fromCsm.accepted,
    relationships: analytics?.relationships ?? 0,
    submissions: analytics?.submissions ?? (submissions.data ?? []).length,
    campaigns: analytics?.campaigns ?? 0,
    pipelineSteps: AUTOMATION_PIPELINE_STEPS,
    recentRuns: runs.data ?? [],
    statusBreakdown: fromCsm.statusBreakdown,
    submissionBreakdown: subCounts,
    analytics,
    campaignCounts: counts,
    metricsSource: 'campaign_state' as const,
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
  const trackingMap: Record<string, string> = {
    prepared: 'ready',
    ready: 'ready',
    awaiting_approval: 'awaiting_approval',
    submitted: 'submitted',
    waiting: 'pending_review',
    pending_review: 'pending_review',
    accepted: 'accepted',
    rejected: 'rejected',
    failed: 'failed',
    published: 'accepted',
    verified: 'verified',
  };
  if (trackingMap[status]) patch.tracking_status = trackingMap[status];
  if (status === 'submitted') patch.submitted_at = new Date().toISOString();
  if (status === 'published' || status === 'accepted') patch.published_at = new Date().toISOString();
  if (status === 'verified') patch.verified_at = new Date().toISOString();

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
    pending_review: 'waiting',
    accepted: 'accepted',
    rejected: 'rejected',
    published: 'published',
    verified: 'verified',
    failed: 'rejected',
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

  const sourceUrl = String(bl.source_url ?? bl.url ?? '');
  const targetUrl = String(bl.target_url ?? '');
  const checkId = randomUUID();
  let result;

  try {
    const res = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'SEO-OS-BacklinkVerifier/1.0' },
    });
    const html = await res.text();
    result = inspectBacklinkHtml(
      html,
      {
        targetUrl,
        expectedAnchor: bl.anchor_text ? String(bl.anchor_text) : undefined,
      },
      res.status,
      res.url
    );
  } catch (err) {
    result = {
      outcome: 'unreachable' as const,
      httpStatus: null,
      redirectUrl: null,
      targetFound: false,
      anchorMatched: null,
      isNofollow: null,
      isBroken: true,
      checkedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : 'fetch_failed',
    };
  }

  const statusMap: Record<string, string> = {
    verified: 'verified',
    pending: 'pending',
    broken: 'broken',
    redirected: 'redirected',
    unreachable: 'broken',
  };

  await getSupabaseAdmin()
    .from('backlink_checks')
    .insert({
      id: checkId,
      backlink_id: backlinkId,
      workspace_id: workspaceId,
      status: statusMap[result.outcome] ?? 'pending',
      check_type: 'automated',
      is_broken: result.isBroken,
      redirect_url: result.redirectUrl,
      http_status: result.httpStatus,
      checked_at: result.checkedAt,
      metadata: {
        targetFound: result.targetFound,
        anchorMatched: result.anchorMatched,
        isNofollow: result.isNofollow,
        errorMessage: 'errorMessage' in result ? result.errorMessage : undefined,
      },
    });

  if (result.outcome === 'verified') {
    await getSupabaseAdmin()
      .from('backlinks')
      .update({ verification_status: 'verified', verified_at: new Date().toISOString() })
      .eq('id', backlinkId);
  } else if (result.outcome === 'broken' || result.outcome === 'unreachable' || result.outcome === 'redirected') {
    await getSupabaseAdmin()
      .from('backlinks')
      .update({ verification_status: result.outcome === 'redirected' ? 'unreachable' : 'lost' })
      .eq('id', backlinkId);
  }

  return { checkId, outcome: result.outcome, backlinkId, details: result };
}

export async function enqueueVerificationCheck(workspaceId: string, backlinkId: string) {
  const jobId = await enqueueJob(
    QUEUES.CRAWL,
    'backlink_verify',
    { type: 'backlink_verify', workspaceId, backlinkId },
    { singletonKey: `verify-${backlinkId}`, retryLimit: 2, retryDelay: 30 }
  );
  if (!jobId) {
    return runVerificationCheck(workspaceId, backlinkId);
  }
  return { queued: true, jobId, backlinkId };
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
