import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import pptxgen from 'pptxgenjs';
import ExcelJS from 'exceljs';

type PptxSlide = {
  addShape: (...args: unknown[]) => void;
  addText: (...args: unknown[]) => void;
  addTable: (...args: unknown[]) => void;
};

type PptxInstance = {
  author: string;
  title: string;
  ShapeType: { rect: string };
  addSlide: () => PptxSlide;
  write: (opts: { outputType: string }) => Promise<Buffer>;
};
import {
  REPORT_TYPES,
  REPORT_TYPE_META,
  buildReportDocument,
  computeNextRunAt,
  flattenReportForCsv,
  reportToPlainText,
  type GeneratedReportDocument,
  type ReportBrandConfig,
  type ReportExportFormat,
  type ReportSchedule,
  type ReportType,
} from '@seo-os/reports-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getAnalyticsOverview } from '../analytics/analytics.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';
import { createEmailProviderFromAccount } from '@seo-os/providers';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

async function metricsFromAnalytics(workspaceId: string) {
  const overview = await getAnalyticsOverview(workspaceId, { persistInsights: false });
  const kpi = (key: string) => overview.kpis.find((k) => k.key === key)?.value ?? 0;
  let technical: Record<string, number> = {};
  try {
    const { getTechnicalAnalytics } = await import('../technical-seo/technical-seo.service.js');
    const t = await getTechnicalAnalytics(workspaceId);
    technical = {
      technicalHealthScore: t.healthScore,
      pagesAudited: t.pagesAudited,
      issueResolutionRate: t.issueResolutionRate,
      averageFixMinutes: t.averageFixMinutes,
      criticalSeoIssues: t.issuesBySeverity.find((i) => i.name === 'critical')?.value ?? 0,
      highSeoIssues: t.issuesBySeverity.find((i) => i.name === 'high')?.value ?? 0,
    };
  } catch {
    /* optional until audits exist */
  }
  let integrations: Record<string, number> = {};
  try {
    const { getSyncedMetrics } = await import('../integrations/integrations.service.js');
    const m = await getSyncedMetrics(workspaceId);
    integrations = {
      gscClicks: m.searchConsole.clicks,
      gscImpressions: m.searchConsole.impressions,
      gscCtr: Math.round(m.searchConsole.ctr * 10000) / 100,
      gscPosition: m.searchConsole.position,
      ga4Sessions: m.analytics.sessions,
      ga4Users: m.analytics.users,
      ga4Conversions: m.analytics.conversions,
    };
  } catch {
    /* optional until integrations synced */
  }
  return {
    metrics: {
      backlinksWon: kpi('backlinks_won'),
      campaignSuccessRate: kpi('campaign_success'),
      workflowSuccessRate: kpi('workflow_success'),
      aiHoursSaved: kpi('ai_productivity'),
      replyRate: kpi('reply_rate'),
      relationshipHealth: kpi('relationship_health'),
      opportunities: kpi('opportunities'),
      roiIndex: kpi('roi_index'),
      emailsSent: overview.growth.today.emailsSent ?? 0,
      workflowsExecuted: overview.growth.today.workflowsRun ?? 0,
      aiTasksCompleted: overview.growth.today.aiTasks ?? 0,
      ...technical,
      ...integrations,
    } as Record<string, number>,
    insights: overview.insights,
    forecasts: overview.forecasts.map((f) => ({
      metric: f.metric,
      current: f.current,
      projected30d: f.projected30d,
      projected90d: f.projected90d,
    })),
  };
}

export async function listReportTypes() {
  return REPORT_TYPES.map((t) => ({ type: t, ...REPORT_TYPE_META[t] }));
}

export async function getReportsSummary(workspaceId: string) {
  const [reports, runs] = await Promise.all([
    getSupabaseAdmin().from('reports').select('id, status, schedule').eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('report_runs')
      .select('id, status, created_at, report_id')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const reportRows = reports.data ?? [];
  const runRows = runs.data ?? [];
  return {
    totalReports: reportRows.length,
    scheduled: reportRows.filter((r) =>
      ['weekly', 'monthly', 'quarterly'].includes(String(r.schedule))
    ).length,
    recentReady: runRows.filter((r) => r.status === 'ready').slice(0, 8),
    failed: runRows.filter((r) => r.status === 'failed').slice(0, 8),
    queue: runRows.filter((r) => ['queued', 'generating'].includes(String(r.status))),
    readyCount: runRows.filter((r) => r.status === 'ready').length,
    failedCount: runRows.filter((r) => r.status === 'failed').length,
  };
}

export async function listBrands(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('report_brands')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertBrand(
  workspaceId: string,
  input: Partial<ReportBrandConfig> & { id?: string; isDefault?: boolean }
) {
  const row = {
    workspace_id: workspaceId,
    name: input.name ?? 'Brand',
    logo_url: input.logoUrl ?? null,
    primary_color: input.primaryColor ?? '#0d9488',
    secondary_color: input.secondaryColor ?? '#0369a1',
    footer_text: input.footerText ?? null,
    cover_title: input.coverTitle ?? null,
    agency_name: input.agencyName ?? null,
    agency_email: input.agencyEmail ?? null,
    agency_website: input.agencyWebsite ?? null,
    is_default: input.isDefault ?? false,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await getSupabaseAdmin()
      .from('report_brands')
      .update(row)
      .eq('id', input.id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await getSupabaseAdmin()
    .from('report_brands')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listReports(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('reports')
    .select('*, report_brands(name, primary_color)')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createReport(
  workspaceId: string,
  userId: string,
  input: {
    reportType: ReportType;
    title?: string;
    description?: string;
    brandId?: string;
    schedule?: ReportSchedule;
  }
) {
  const meta = REPORT_TYPE_META[input.reportType];
  const schedule = input.schedule ?? 'manual';
  const next = computeNextRunAt(schedule);
  const { data, error } = await getSupabaseAdmin()
    .from('reports')
    .insert({
      workspace_id: workspaceId,
      report_type: input.reportType,
      title: input.title || meta.label,
      description: input.description ?? meta.description,
      brand_id: input.brandId ?? null,
      schedule,
      next_run_at: next?.toISOString() ?? null,
      status: 'draft',
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateReport(
  reportId: string,
  workspaceId: string,
  patch: {
    title?: string;
    description?: string;
    brandId?: string | null;
    schedule?: ReportSchedule;
    status?: string;
  }
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.brandId !== undefined) update.brand_id = patch.brandId;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.schedule !== undefined) {
    update.schedule = patch.schedule;
    update.next_run_at = computeNextRunAt(patch.schedule)?.toISOString() ?? null;
  }
  const { data, error } = await getSupabaseAdmin()
    .from('reports')
    .update(update)
    .eq('id', reportId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listRuns(workspaceId: string, reportId?: string) {
  let q = getSupabaseAdmin()
    .from('report_runs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (reportId) q = q.eq('report_id', reportId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getRun(runId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('report_runs')
    .select('*, reports(title, report_type, brand_id)')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function enqueueReportGeneration(reportId: string, workspaceId: string) {
  const { data: report } = await getSupabaseAdmin()
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!report) throw Object.assign(new Error('Report not found'), { status: 404 });

  const { data: run, error } = await getSupabaseAdmin()
    .from('report_runs')
    .insert({
      report_id: reportId,
      workspace_id: workspaceId,
      status: 'queued',
      progress: 0,
    })
    .select('*')
    .single();
  if (error) throw error;

  await getSupabaseAdmin()
    .from('reports')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', reportId);

  const jobId = await enqueueJob(QUEUES.LOW, 'report.generate', {
    type: 'report_generate',
    runId: run.id,
    workspaceId,
    reportId,
  });
  if (!jobId) {
    return generateReportRun(run.id, workspaceId);
  }
  return run;
}

export async function generateReportRun(runId: string, workspaceId: string) {
  const { data: run } = await getSupabaseAdmin()
    .from('report_runs')
    .select('*, reports(*)')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!run) throw new Error('Run not found');

  const report = run.reports as {
    id: string;
    report_type: string;
    title: string;
    brand_id?: string | null;
    schedule?: string;
  };

  await getSupabaseAdmin()
    .from('report_runs')
    .update({
      status: 'generating',
      progress: 15,
      started_at: new Date().toISOString(),
    })
    .eq('id', runId);
  await getSupabaseAdmin()
    .from('reports')
    .update({ status: 'generating' })
    .eq('id', report.id);

  try {
    let brand: ReportBrandConfig | undefined;
    if (report.brand_id) {
      const { data: b } = await getSupabaseAdmin()
        .from('report_brands')
        .select('*')
        .eq('id', report.brand_id)
        .maybeSingle();
      if (b) {
        brand = {
          name: b.name,
          logoUrl: b.logo_url,
          primaryColor: b.primary_color,
          secondaryColor: b.secondary_color,
          footerText: b.footer_text,
          coverTitle: b.cover_title,
          agencyName: b.agency_name,
          agencyEmail: b.agency_email,
          agencyWebsite: b.agency_website,
        };
      }
    } else {
      const { data: brands } = await getSupabaseAdmin()
        .from('report_brands')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_default', true)
        .limit(1);
      const b = brands?.[0];
      if (b) {
        brand = {
          name: b.name,
          logoUrl: b.logo_url,
          primaryColor: b.primary_color,
          secondaryColor: b.secondary_color,
          footerText: b.footer_text,
          coverTitle: b.cover_title,
          agencyName: b.agency_name,
          agencyEmail: b.agency_email,
          agencyWebsite: b.agency_website,
        };
      }
    }

    await getSupabaseAdmin().from('report_runs').update({ progress: 40 }).eq('id', runId);

    const { metrics, insights, forecasts } = await metricsFromAnalytics(workspaceId);
    const doc = buildReportDocument({
      reportType: report.report_type as ReportType,
      title: report.title,
      brand,
      metrics,
      insights,
      forecasts,
      periodLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    });

    await getSupabaseAdmin().from('report_runs').update({ progress: 75 }).eq('id', runId);

    const { data: updated, error } = await getSupabaseAdmin()
      .from('report_runs')
      .update({
        status: 'ready',
        progress: 100,
        executive_summary: doc.executiveSummary,
        sections: doc.sections,
        metrics: doc.metrics,
        insights: doc.insights,
        forecasts: doc.forecasts,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select('*')
      .single();
    if (error) throw error;

    const next = computeNextRunAt(String(report.schedule ?? 'manual'));
    await getSupabaseAdmin()
      .from('reports')
      .update({
        status: 'ready',
        last_run_at: new Date().toISOString(),
        next_run_at: next?.toISOString() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    return { run: updated, document: doc };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report generation failed';
    logger.error({ err, runId }, 'report generation failed');
    await getSupabaseAdmin()
      .from('report_runs')
      .update({ status: 'failed', error: message, progress: 100 })
      .eq('id', runId);
    await getSupabaseAdmin()
      .from('reports')
      .update({ status: 'failed' })
      .eq('id', report.id);
    throw err;
  }
}

export async function exportReportRun(
  runId: string,
  workspaceId: string,
  format: ReportExportFormat
) {
  const run = await getRun(runId, workspaceId);
  if (!run || run.status !== 'ready') {
    throw Object.assign(new Error('Report run not ready'), { status: 400 });
  }

  const reportMeta = run.reports as { title?: string; report_type?: string; brand_id?: string };
  let brand: Partial<ReportBrandConfig> = {};
  if (reportMeta?.brand_id) {
    const { data: b } = await getSupabaseAdmin()
      .from('report_brands')
      .select('*')
      .eq('id', reportMeta.brand_id)
      .maybeSingle();
    if (b) {
      brand = {
        name: b.name,
        logoUrl: b.logo_url,
        primaryColor: b.primary_color,
        secondaryColor: b.secondary_color,
        footerText: b.footer_text,
        coverTitle: b.cover_title,
        agencyName: b.agency_name,
        agencyEmail: b.agency_email,
        agencyWebsite: b.agency_website,
      };
    }
  }

  const doc = buildReportDocument({
    reportType: (reportMeta?.report_type as ReportType) || 'executive',
    title: reportMeta?.title,
    brand,
    metrics: (run.metrics ?? {}) as Record<string, number>,
    insights: (run.insights ?? []) as Array<{ title: string; body?: string; severity?: string }>,
    forecasts: (run.forecasts ?? []) as Array<{
      metric: string;
      current: number;
      projected30d: number;
      projected90d: number;
    }>,
  });
  // Prefer persisted executive summary / sections
  doc.executiveSummary = (run.executive_summary as typeof doc.executiveSummary) ?? doc.executiveSummary;
  doc.sections = (run.sections as typeof doc.sections) ?? doc.sections;

  let body: Buffer | string;
  let contentType: string;
  let filename: string;

  if (format === 'json') {
    body = JSON.stringify(doc, null, 2);
    contentType = 'application/json';
    filename = `${slug(doc.title)}.json`;
  } else if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    const rows = flattenReportForCsv(doc);
    rows.forEach((r, i) => {
      if (i === 0) sheet.addRow(r).font = { bold: true };
      else sheet.addRow(r);
    });
    body = Buffer.from(await workbook.xlsx.writeBuffer());
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `${slug(doc.title)}.xlsx`;
  } else if (format === 'csv') {
    body = flattenReportForCsv(doc)
      .map((r) => r.map(csvEscape).join(','))
      .join('\n');
    contentType = 'text/csv';
    filename = `${slug(doc.title)}.csv`;
  } else if (format === 'pdf') {
    body = await renderPdf(doc);
    contentType = 'application/pdf';
    filename = `${slug(doc.title)}.pdf`;
  } else {
    body = await renderPptx(doc);
    contentType =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    filename = `${slug(doc.title)}.pptx`;
  }

  const contentStr =
    typeof body === 'string'
      ? body
      : body.toString(format === 'pdf' || format === 'pptx' || format === 'xlsx' ? 'base64' : 'utf8');

  await getSupabaseAdmin().from('report_exports').insert({
    run_id: runId,
    workspace_id: workspaceId,
    format,
    status: 'ready',
    content:
      format === 'pdf' || format === 'pptx' || format === 'xlsx'
        ? contentStr
        : contentStr.slice(0, 200_000),
    byte_size: typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength,
  });

  await getSupabaseAdmin().from('report_deliveries').insert({
    run_id: runId,
    workspace_id: workspaceId,
    channel: 'download',
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  return { body, contentType, filename, format };
}

export async function emailReportRun(
  runId: string,
  workspaceId: string,
  recipient: string
) {
  const exported = await exportReportRun(runId, workspaceId, 'pdf');
  const provider = createEmailProviderFromAccount('mock', {});
  const result = await provider.send({
    to: recipient,
    subject: `SEO OS Report — ${exported.filename}`,
    bodyText: `Your report is attached as ${exported.filename}.`,
    bodyHtml: `<p>Your report <strong>${exported.filename}</strong> is ready.</p>`,
  });

  await getSupabaseAdmin().from('report_deliveries').insert({
    run_id: runId,
    workspace_id: workspaceId,
    channel: 'email',
    recipient,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  return { ok: true, messageId: result.messageId, filename: exported.filename };
}

export async function shareReportInternally(runId: string, workspaceId: string) {
  await getSupabaseAdmin().from('report_deliveries').insert({
    run_id: runId,
    workspace_id: workspaceId,
    channel: 'internal',
    status: 'sent',
    sent_at: new Date().toISOString(),
  });
  return { ok: true, sharePath: `/reports/runs/${runId}` };
}

export async function processDueScheduledReports(workspaceId?: string) {
  let q = getSupabaseAdmin()
    .from('reports')
    .select('id, workspace_id')
    .in('schedule', ['weekly', 'monthly', 'quarterly'])
    .lte('next_run_at', new Date().toISOString())
    .limit(20);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data } = await q;
  const started = [];
  for (const r of data ?? []) {
    started.push(await enqueueReportGeneration(r.id, r.workspace_id));
  }
  return started;
}

async function renderPdf(doc: GeneratedReportDocument): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(doc.brand.primaryColor || '#0d9488');
  let page = pdf.addPage([612, 792]);
  let y = 750;

  const draw = (text: string, size = 11, useBold = false) => {
    const f = useBold ? bold : font;
    const lines = wrap(text, 86);
    for (const line of lines) {
      if (y < 60) {
        page = pdf.addPage([612, 792]);
        y = 750;
      }
      page.drawText(line, {
        x: 48,
        y,
        size,
        font: f,
        color: rgb(0.1, 0.12, 0.15),
      });
      y -= size + 4;
    }
  };

  page.drawRectangle({
    x: 0,
    y: 720,
    width: 612,
    height: 72,
    color: rgb(primary.r, primary.g, primary.b),
  });
  page.drawText(doc.brand.coverTitle || doc.title, {
    x: 48,
    y: 748,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(doc.brand.agencyName || doc.brand.name, {
    x: 48,
    y: 728,
    size: 10,
    font,
    color: rgb(1, 1, 1),
  });
  y = 690;
  draw(`Period: ${doc.periodLabel}`, 10);
  draw(`Generated: ${doc.generatedAt}`, 10);
  y -= 8;
  draw('Executive Summary', 14, true);
  draw(doc.executiveSummary.narrative, 11);
  y -= 6;
  draw('Highlights', 12, true);
  doc.executiveSummary.highlights.forEach((h) => draw(`• ${h}`));
  y -= 4;
  draw('Key Wins', 12, true);
  doc.executiveSummary.keyWins.forEach((h) => draw(`• ${h}`));
  y -= 4;
  draw('Risks', 12, true);
  (doc.executiveSummary.risks.length
    ? doc.executiveSummary.risks
    : ['No critical risks flagged.']
  ).forEach((h) => draw(`• ${h}`));
  y -= 4;
  draw('Recommendations', 12, true);
  doc.executiveSummary.recommendations.forEach((h) => draw(`• ${h}`));
  y -= 4;
  draw('Next Actions', 12, true);
  doc.executiveSummary.nextActions.forEach((h) => draw(`• ${h}`));

  for (const section of doc.sections.slice(1)) {
    y -= 8;
    draw(section.title, 13, true);
    draw(section.body);
    for (const row of section.rows ?? []) {
      draw(`  ${row.label}: ${row.value}`, 10);
    }
  }

  if (doc.brand.footerText) {
    page.drawText(doc.brand.footerText.slice(0, 90), {
      x: 48,
      y: 36,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function renderPptx(doc: GeneratedReportDocument): Promise<Buffer> {
  // pptxgenjs CJS/ESM interop
  const Ctor = (pptxgen as unknown as { default?: new () => PptxInstance }).default ?? (pptxgen as unknown as new () => PptxInstance);
  const pptx = new Ctor();
  pptx.author = doc.brand.agencyName || 'SEO OS';
  pptx.title = doc.title;
  const primary = doc.brand.primaryColor || '#0d9488';

  const cover = pptx.addSlide();
  cover.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: 1.2,
    fill: { color: primary.replace('#', '') },
  });
  cover.addText(doc.brand.coverTitle || doc.title, {
    x: 0.5,
    y: 1.6,
    w: 9,
    h: 1,
    fontSize: 28,
    bold: true,
    color: '1a1a1a',
  });
  cover.addText(doc.brand.agencyName || doc.brand.name, {
    x: 0.5,
    y: 2.5,
    w: 9,
    fontSize: 14,
    color: '555555',
  });
  cover.addText(`${doc.periodLabel} · ${doc.generatedAt.slice(0, 10)}`, {
    x: 0.5,
    y: 3.0,
    w: 9,
    fontSize: 12,
    color: '777777',
  });

  const exec = pptx.addSlide();
  exec.addText('Executive Summary', { x: 0.5, y: 0.3, fontSize: 20, bold: true, color: primary.replace('#', '') });
  exec.addText(doc.executiveSummary.narrative, { x: 0.5, y: 0.9, w: 9, h: 1.5, fontSize: 13 });
  exec.addText(
    [
      { text: 'Highlights', options: { bold: true, breakLine: true } },
      ...doc.executiveSummary.highlights.map((h) => ({ text: `• ${h}`, options: { breakLine: true } })),
    ],
    { x: 0.5, y: 2.5, w: 4.5, h: 3, fontSize: 12 }
  );
  exec.addText(
    [
      { text: 'Recommendations', options: { bold: true, breakLine: true } },
      ...doc.executiveSummary.recommendations.map((h) => ({
        text: `• ${h}`,
        options: { breakLine: true },
      })),
    ],
    { x: 5.2, y: 2.5, w: 4.5, h: 3, fontSize: 12 }
  );

  for (const section of doc.sections.slice(0, 6)) {
    const s = pptx.addSlide();
    s.addText(section.title, { x: 0.5, y: 0.3, fontSize: 18, bold: true, color: primary.replace('#', '') });
    s.addText(section.body, { x: 0.5, y: 0.9, w: 9, h: 1.2, fontSize: 13 });
    if (section.rows?.length) {
      s.addTable(
        [
          [
            { text: 'Metric', options: { bold: true } },
            { text: 'Value', options: { bold: true } },
          ],
          ...section.rows.slice(0, 8).map((r) => [String(r.label), String(r.value)]),
        ],
        { x: 0.5, y: 2.3, w: 9, colW: [5, 4], border: [{ pt: 0.5, color: 'CCCCCC' }], fontSize: 11 }
      );
    }
  }

  const closing = pptx.addSlide();
  closing.addText('Next Actions & Outlook', {
    x: 0.5,
    y: 0.4,
    fontSize: 20,
    bold: true,
    color: primary.replace('#', ''),
  });
  closing.addText(doc.executiveSummary.nextActions.map((a) => `• ${a}`).join('\n'), {
    x: 0.5,
    y: 1.2,
    w: 9,
    h: 2,
    fontSize: 13,
  });
  closing.addText(doc.executiveSummary.projectedGrowth.map((a) => `• ${a}`).join('\n'), {
    x: 0.5,
    y: 3.4,
    w: 9,
    h: 1.5,
    fontSize: 12,
    color: '444444',
  });
  if (doc.brand.footerText) {
    closing.addText(doc.brand.footerText, { x: 0.5, y: 5.1, w: 9, fontSize: 10, color: '888888' });
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return Buffer.from(out);
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
}

/** V1.0 Backlink Operations Excel export + CSV/PDF variants */
export async function exportBacklinkOpsWorkbook(
  workspaceId: string,
  format: 'xlsx' | 'csv' | 'pdf' = 'xlsx'
) {
  const { data: submissions } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select(
      'id, opportunity_id, status, tracking_status, queue_stage, submitted_at, verified_at, estimated_review_hours, estimated_approval_hours, notes, metadata, opportunities:opportunity_id(id, title, domain, opportunity_type, priority, automation_status, queue_status, website_name, url, metadata, campaign_lifecycle)'
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(500);

  // Assisted Manual Done packages (authoritative when submission row missing)
  const { data: assistedDone } = await getSupabaseAdmin()
    .from('assisted_packages')
    .select(
      'id, domain, entry_url, submitted_at, verified_at, user_verified, minutes_spent, payload, status, opportunity_id'
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'done')
    .limit(500);

  const header = [
    'Domain',
    'Entry URL',
    'Submitted At',
    'Method',
    'Verified',
    'Verified At',
    'Minutes',
    'Content Used',
    'Website',
    'Detected Type',
    'Status',
    'Notes',
  ];

  const rows: string[][] = [header];
  const seenOpp = new Set<string>();

  for (const row of submissions ?? []) {
    const opp = row.opportunities as {
      title?: string;
      domain?: string;
      website_name?: string;
      opportunity_type?: string;
      url?: string;
      metadata?: {
        classification?: { displayName?: string; id?: string };
        submission?: {
          method?: string;
          entry_url?: string;
          content?: Array<{ label?: string; role?: string; value?: string }>;
          minutes_spent?: number;
        };
      } | null;
    } | null;
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const oppSub = opp?.metadata?.submission;
    const method =
      String(meta.method ?? oppSub?.method ?? '') === 'assisted_manual'
        ? 'assisted'
        : String(meta.method ?? '') === 'auto' || String(meta.generated_by ?? '') === 'automation_pipeline'
          ? 'auto'
          : row.submitted_at
            ? 'auto'
            : '';
    if (!row.submitted_at && method !== 'assisted') continue;

    const entryUrl = String(
      meta.entry_url ?? oppSub?.entry_url ?? opp?.url ?? ''
    );
    const contentArr =
      (meta.content as Array<{ label?: string; role?: string; value?: string }> | undefined) ??
      oppSub?.content ??
      [];
    const contentUsed = contentArr
      .map((f) => `${f.label || f.role || ''}: ${String(f.value ?? '').slice(0, 120)}`)
      .filter(Boolean)
      .join(' · ');
    const oppId = String(row.opportunity_id ?? (opp as { id?: string } | null)?.id ?? '');
    if (oppId) seenOpp.add(oppId);

    rows.push([
      opp?.domain ?? String(meta.domain ?? ''),
      entryUrl,
      row.submitted_at ? String(row.submitted_at) : '',
      method || 'auto',
      row.verified_at || meta.user_verified === true ? 'yes' : 'no',
      row.verified_at ? String(row.verified_at) : '',
      meta.minutes_spent != null
        ? String(meta.minutes_spent)
        : oppSub?.minutes_spent != null
          ? String(oppSub.minutes_spent)
          : '',
      contentUsed,
      opp?.website_name ?? opp?.title ?? '',
      opp?.metadata?.classification?.displayName ??
        opp?.metadata?.classification?.id ??
        opp?.opportunity_type ??
        '',
      row.queue_stage ?? row.tracking_status ?? row.status ?? '',
      row.notes ?? '',
    ]);
  }

  for (const pkg of assistedDone ?? []) {
    const oppId = String(pkg.opportunity_id ?? '');
    if (oppId && seenOpp.has(oppId)) continue;
    const payload = (pkg.payload as {
      fields?: Array<{ label?: string; role?: string; value?: string }>;
    }) ?? {};
    const contentUsed = (payload.fields ?? [])
      .map((f) => `${f.label || f.role || ''}: ${String(f.value ?? '').slice(0, 120)}`)
      .filter(Boolean)
      .join(' · ');
    rows.push([
      String(pkg.domain ?? ''),
      String(pkg.entry_url ?? ''),
      pkg.submitted_at ? String(pkg.submitted_at) : '',
      'assisted',
      pkg.user_verified || pkg.verified_at ? 'yes' : 'no',
      pkg.verified_at ? String(pkg.verified_at) : '',
      pkg.minutes_spent != null ? String(pkg.minutes_spent) : '',
      contentUsed,
      String(pkg.domain ?? ''),
      '',
      'submitted',
      'Assisted Manual',
    ]);
  }

  if (format === 'csv') {
    const body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    return {
      body: Buffer.from(body, 'utf8'),
      contentType: 'text/csv',
      filename: 'backlink-operations.csv',
    };
  }

  if (format === 'pdf') {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let page = doc.addPage();
    let y = page.getHeight() - 40;
    page.drawText('Submitted Sites Report', { x: 40, y, size: 14, font });
    y -= 24;
    for (const r of rows.slice(0, 40)) {
      if (y < 40) {
        page = doc.addPage();
        y = page.getHeight() - 40;
      }
      page.drawText(r.join(' | ').slice(0, 110), { x: 40, y, size: 8, font });
      y -= 12;
    }
    const pdfBytes = await doc.save();
    return {
      body: Buffer.from(pdfBytes),
      contentType: 'application/pdf',
      filename: 'backlink-operations.pdf',
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEO OS Backlink Builder';
  const sheet = workbook.addWorksheet('Submitted Sites');
  rows.forEach((r, i) => {
    if (i === 0) sheet.addRow(r).font = { bold: true };
    else sheet.addRow(r);
  });
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    body,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'backlink-operations.xlsx',
  };
}

/** Phase 6.3.1 — Manual submissions Excel (evidence-aware after backfill). */
export async function exportManualLinksWorkbook(
  workspaceId: string,
  format: 'xlsx' | 'csv' | 'pdf' = 'xlsx'
) {
  const { resolveItemLane } = await import('@seo-os/backlink-builder');
  const {
    backfillManualLanes,
    loadLaneEvidenceForWorkspace,
  } = await import('../browser-execution/manual-lane-backfill.service.js');
  await backfillManualLanes(workspaceId);
  const evidence = await loadLaneEvidenceForWorkspace(workspaceId);

  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, title, domain, url, opportunity_type, website_name, campaign_lifecycle, metadata, last_error'
    )
    .eq('workspace_id', workspaceId)
    .neq('campaign_lifecycle', 'Deleted')
    .limit(2000);
  const oppById = new Map((opps ?? []).map((o) => [String(o.id), o]));

  const header = [
    'Website',
    'Reason',
    'Entry URL',
    'Detected Platform',
    'Strategy',
    'Backlink Type',
    'Notes',
    'Anchor / Content Ref',
    'Confidence',
  ];
  const rows: string[][] = [header];
  for (const row of evidence) {
    const resolved = resolveItemLane(row);
    if (!resolved.inActiveCohort || resolved.lane !== 'manual') continue;
    const o = oppById.get(row.id);
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const enrichment = (meta.importEnrichment as Record<string, unknown> | null) ?? {};
    const classification = (meta.classification as Record<string, unknown> | null) ?? {};
    const sie = (meta.siteIntelligence as Record<string, unknown> | null) ?? {};
    rows.push([
      String(o?.website_name ?? o?.title ?? row.domain ?? ''),
      String(resolved.reason ?? 'Manual'),
      String(meta.divertedUrl ?? o?.url ?? row.websiteUrl ?? ''),
      String(sie.platform ?? meta.cms ?? classification.displayName ?? ''),
      String(sie.strategy ?? meta.workflowQueue ?? ''),
      String(o?.opportunity_type ?? classification.id ?? ''),
      String(o?.last_error ?? enrichment.notes ?? ''),
      String(enrichment.anchorText ?? enrichment.description ?? enrichment.targetPage ?? ''),
      resolved.confidence,
    ]);
  }

  if (format === 'csv') {
    const body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    return {
      body: Buffer.from(body, 'utf8'),
      contentType: 'text/csv',
      filename: 'manual-submissions.csv',
    };
  }

  if (format === 'pdf') {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let page = doc.addPage();
    let y = page.getHeight() - 40;
    page.drawText('Manual Submissions (offline)', { x: 40, y, size: 14, font });
    y -= 24;
    for (const r of rows.slice(0, 50)) {
      if (y < 40) {
        page = doc.addPage();
        y = page.getHeight() - 40;
      }
      page.drawText(r.join(' | ').slice(0, 110), { x: 40, y, size: 8, font });
      y -= 12;
    }
    const pdfBytes = await doc.save();
    return {
      body: Buffer.from(pdfBytes),
      contentType: 'application/pdf',
      filename: 'manual-submissions.pdf',
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEO OS';
  const sheet = workbook.addWorksheet('Manual Submissions');
  rows.forEach((r, i) => {
    if (i === 0) sheet.addRow(r).font = { bold: true };
    else sheet.addRow(r);
  });
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    body,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'manual-submissions.xlsx',
  };
}

export { reportToPlainText };
