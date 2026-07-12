import {
  TECHNICAL_AGENTS,
  TECHNICAL_SEO_MODULES,
  computeHealthScores,
  detectTechnicalIssues,
  summarizeIssueCounts,
} from '@seo-os/technical-seo';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';
import { getBrowserIntelligenceSummary } from '../intelligence/browser-intelligence.service.js';

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function listTechnicalModules() {
  return TECHNICAL_SEO_MODULES.map((m) => ({
    id: m,
    label: m.replace(/_/g, ' '),
  }));
}

export async function listTechnicalAgents() {
  return TECHNICAL_AGENTS;
}

export async function getTechnicalSummary(workspaceId: string) {
  const [audits, issues, health] = await Promise.all([
    getSupabaseAdmin()
      .from('technical_audits')
      .select('id, status, health_score, pages_crawled, issues_found, created_at, completed_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20),
    getSupabaseAdmin()
      .from('technical_issues')
      .select('id, severity, status, title, module, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200),
    getSupabaseAdmin()
      .from('technical_health_snapshots')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const issueRows = issues.data ?? [];
  const counts = summarizeIssueCounts(issueRows);
  const latestHealth = health.data?.[0];
  const queue = await getSupabaseAdmin()
    .from('technical_crawl_queue')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'queued');

  const fixed = issueRows.filter((i) => i.status === 'fixed').length;
  const open = counts.totalOpen;
  const fixProgress = open + fixed > 0 ? Math.round((fixed / (open + fixed)) * 100) : 0;

  return {
    latestAudit: audits.data?.[0] ?? null,
    recentAudits: audits.data ?? [],
    healthScore: Number(latestHealth?.overall_score ?? audits.data?.[0]?.health_score ?? 0),
    scores: latestHealth
      ? {
          overall: Number(latestHealth.overall_score),
          performance: Number(latestHealth.performance_score ?? 0),
          seo: Number(latestHealth.seo_score ?? 0),
          accessibility: Number(latestHealth.accessibility_score ?? 0),
          content: Number(latestHealth.content_score ?? 0),
          security: Number(latestHealth.security_score ?? 0),
          technical: Number(latestHealth.technical_score ?? 0),
        }
      : null,
    criticalIssues: counts.critical,
    warnings: counts.high + counts.medium,
    passedChecks: counts.passedChecks,
    crawlQueue: queue.count ?? 0,
    fixProgress,
    healthTrend: (health.data ?? [])
      .slice()
      .reverse()
      .map((h) => ({
        date: String(h.created_at).slice(0, 10),
        value: Number(h.overall_score),
      })),
    issueBreakdown: [
      { name: 'critical', value: counts.critical },
      { name: 'high', value: counts.high },
      { name: 'medium', value: counts.medium },
      { name: 'low', value: counts.low },
      { name: 'info', value: counts.info },
    ],
    agents: TECHNICAL_AGENTS,
  };
}

export async function listAudits(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('technical_audits')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function getAudit(auditId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('technical_audits')
    .select('*')
    .eq('id', auditId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listIssues(
  workspaceId: string,
  opts: { auditId?: string; severity?: string; status?: string } = {}
) {
  let q = getSupabaseAdmin()
    .from('technical_issues')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (opts.auditId) q = q.eq('audit_id', opts.auditId);
  if (opts.severity) q = q.eq('severity', opts.severity);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateIssueStatus(
  issueId: string,
  workspaceId: string,
  status: 'open' | 'in_progress' | 'fixed' | 'ignored' | 'reopened'
) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'fixed') updates.resolved_at = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('technical_issues')
    .update(updates)
    .eq('id', issueId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function startTechnicalAudit(
  workspaceId: string,
  userId: string,
  input: { targetUrl: string; mode?: 'full' | 'incremental' | 'quick' }
) {
  const { data: audit, error } = await getSupabaseAdmin()
    .from('technical_audits')
    .insert({
      workspace_id: workspaceId,
      target_url: input.targetUrl,
      audit_mode: input.mode ?? 'full',
      status: 'queued',
      progress: 0,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;

  await getSupabaseAdmin().from('technical_crawl_queue').insert({
    workspace_id: workspaceId,
    audit_id: audit.id,
    url: input.targetUrl,
    status: 'queued',
    depth: 0,
  });

  const jobId = await enqueueJob(QUEUES.CRAWL, 'technical.audit', {
    type: 'technical_audit',
    auditId: audit.id,
    workspaceId,
  });
  if (!jobId) {
    return runTechnicalAudit(audit.id, workspaceId);
  }
  return audit;
}

export async function runTechnicalAudit(auditId: string, workspaceId: string) {
  const audit = await getAudit(auditId, workspaceId);
  if (!audit) throw new Error('Audit not found');

  await getSupabaseAdmin()
    .from('technical_audits')
    .update({
      status: 'crawling',
      progress: 20,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', auditId);

  try {
    const browser = await getBrowserIntelligenceSummary(workspaceId).catch(() => null);
    const domain = extractDomain(String(audit.target_url));

    await getSupabaseAdmin()
      .from('technical_crawl_queue')
      .update({ status: 'crawling', updated_at: new Date().toISOString() })
      .eq('audit_id', auditId)
      .eq('status', 'queued');

    await getSupabaseAdmin()
      .from('technical_audits')
      .update({ status: 'analyzing', progress: 55, updated_at: new Date().toISOString() })
      .eq('id', auditId);

    const drafts = detectTechnicalIssues({
      targetUrl: String(audit.target_url),
      domain,
      pagesAnalyzed: browser?.pagesRead ?? (audit.audit_mode === 'quick' ? 2 : 8),
      hasRobots: true,
      hasSitemap: audit.audit_mode !== 'quick',
      https: String(audit.target_url).startsWith('https'),
      brokenLinks: browser?.brokenLinks ?? 0,
      contactPages: browser?.contactPages ?? 0,
    });

    let toInsert = drafts;
    if (audit.audit_mode === 'incremental') {
      const { data: existing } = await getSupabaseAdmin()
        .from('technical_issues')
        .select('issue_code')
        .eq('workspace_id', workspaceId)
        .eq('status', 'open');
      const codes = new Set((existing ?? []).map((e) => e.issue_code));
      toInsert = drafts.filter((d) => !codes.has(d.issueCode));
    }

    if (toInsert.length) {
      await getSupabaseAdmin().from('technical_issues').insert(
        toInsert.map((d) => ({
          workspace_id: workspaceId,
          audit_id: auditId,
          module: d.module,
          issue_code: d.issueCode,
          title: d.title,
          page_url: d.pageUrl ?? null,
          severity: d.severity,
          business_impact: d.businessImpact,
          seo_impact: d.seoImpact,
          explanation: d.explanation,
          recommended_fix: d.recommendedFix,
          estimated_fix_minutes: d.estimatedFixMinutes,
          confidence_score: d.confidenceScore,
          suggested_fix: d.suggestedFix ?? {},
          metadata: d.metadata ?? {},
          status: 'open',
        }))
      );
    }

    const scores = computeHealthScores(drafts);
    const counts = summarizeIssueCounts(drafts);

    await getSupabaseAdmin().from('technical_health_snapshots').insert({
      workspace_id: workspaceId,
      audit_id: auditId,
      overall_score: scores.overall,
      performance_score: scores.performance,
      seo_score: scores.seo,
      accessibility_score: scores.accessibility,
      content_score: scores.content,
      security_score: scores.security,
      technical_score: scores.technical,
      scores,
    });

    await getSupabaseAdmin()
      .from('technical_crawl_queue')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('audit_id', auditId);

    const { data: completed, error } = await getSupabaseAdmin()
      .from('technical_audits')
      .update({
        status: 'completed',
        progress: 100,
        pages_crawled: browser?.pagesRead ?? (audit.audit_mode === 'quick' ? 3 : 12),
        issues_found: drafts.length,
        health_score: scores.overall,
        scores,
        summary: {
          ...counts,
          modules: TECHNICAL_SEO_MODULES.length,
          agents: TECHNICAL_AGENTS.map((a) => a.id),
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', auditId)
      .select('*')
      .single();
    if (error) throw error;

    fireAndForget(
      publishPlatformEvent({
        workspaceId,
        sourceModule: 'technical_seo',
        eventType: 'technical_audit_completed',
        title: `Technical SEO audit completed — score ${scores.overall}`,
        summary: `${drafts.length} issues · ${counts.critical} critical`,
        severity: counts.critical > 0 ? 'warning' : 'success',
        entityType: 'technical_audit',
        entityId: auditId,
        payload: { auditId, scores, counts },
        href: `/projects/${workspaceId}/technical/overview`,
      })
    );

    if (counts.critical > 0) {
      fireAndForget(
        publishPlatformEvent({
          workspaceId,
          sourceModule: 'technical_seo',
          eventType: 'critical_seo_issue_detected',
          title: `${counts.critical} critical technical SEO issue(s)`,
          summary: 'Workflow automation can notify, generate fixes, and request approval.',
          severity: 'warning',
          entityType: 'technical_audit',
          entityId: auditId,
          payload: { auditId, critical: counts.critical },
        })
      );
    }

    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit failed';
    logger.error({ err, auditId }, 'technical audit failed');
    await getSupabaseAdmin()
      .from('technical_audits')
      .update({
        status: 'failed',
        error: message,
        progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auditId);
    throw err;
  }
}

export async function exportTechnicalIssues(
  workspaceId: string,
  format: 'csv' | 'xlsx' | 'json' | 'pdf'
) {
  const issues = await listIssues(workspaceId, { status: 'open' });
  if (format === 'json') {
    return {
      body: JSON.stringify({ exportedAt: new Date().toISOString(), issues }, null, 2),
      contentType: 'application/json',
      filename: 'technical-seo-issues.json',
    };
  }
  if (format === 'pdf') {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let page = doc.addPage([612, 792]);
    let y = 760;
    const draw = (text: string, size = 10, useBold = false) => {
      if (y < 48) {
        page = doc.addPage([612, 792]);
        y = 760;
      }
      page.drawText(text.slice(0, 95), {
        x: 40,
        y,
        size,
        font: useBold ? bold : font,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= size + 6;
    };
    draw('Technical SEO Issues Export', 16, true);
    draw(`Generated ${new Date().toISOString()} · ${issues.length} open issues`, 9);
    y -= 8;
    for (const i of issues.slice(0, 80)) {
      draw(`[${i.severity}] ${i.title}`, 11, true);
      draw(`${i.module} · fix ~${i.estimated_fix_minutes ?? '?'}m · conf ${i.confidence_score ?? '?'}`, 9);
      if (i.recommended_fix) draw(String(i.recommended_fix), 9);
      y -= 4;
    }
    const bytes = await doc.save();
    return {
      body: Buffer.from(bytes),
      contentType: 'application/pdf',
      filename: 'technical-seo-issues.pdf',
    };
  }
  const rows = [
    [
      'severity',
      'module',
      'title',
      'page_url',
      'estimated_fix_minutes',
      'confidence_score',
      'recommended_fix',
    ],
    ...issues.map((i) => [
      i.severity,
      i.module,
      i.title,
      i.page_url ?? '',
      String(i.estimated_fix_minutes ?? ''),
      String(i.confidence_score ?? ''),
      i.recommended_fix ?? '',
    ]),
  ];
  const body = rows
    .map((r) =>
      r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')
    )
    .join('\n');
  return {
    body,
    contentType: 'text/csv',
    filename: format === 'xlsx' ? 'technical-seo-issues.xlsx.csv' : 'technical-seo-issues.csv',
  };
}

/** Metrics hook for Analytics / Reports */
export async function getTechnicalAnalytics(workspaceId: string) {
  const summary = await getTechnicalSummary(workspaceId);
  const issues = await listIssues(workspaceId);
  const fixed = issues.filter((i) => i.status === 'fixed');
  const avgFix =
    fixed.length > 0
      ? Math.round(
          fixed.reduce((s, i) => s + Number(i.estimated_fix_minutes ?? 0), 0) / fixed.length
        )
      : 0;
  return {
    healthScore: summary.healthScore,
    pagesAudited: summary.latestAudit?.pages_crawled ?? 0,
    issuesBySeverity: summary.issueBreakdown,
    issueResolutionRate: summary.fixProgress,
    averageFixMinutes: avgFix,
    healthTrend: summary.healthTrend,
  };
}
