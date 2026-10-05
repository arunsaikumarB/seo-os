/**
 * Real backlink path: scan, approval, workflow, AI draft, optional SMTP send,
 * and runVerificationCheck. Loads .env before any API env parse.
 *
 * From the repo root (PowerShell):
 *   npm run e2e:backlinks -- --url "https://www.jayde.com/submit.html" --target "https://your-site.example/" --to "you@gmail.com" --dry-run
 * --to is the SMTP test inbox, not the editor. --editor names a real editor.
 * --send delivers an outreach email only. --dry-run never sends.
 */
import { config as loadDotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');
const repoRoot = resolve(scriptDir, '../../..');

loadDotenv({ path: resolve(repoRoot, '.env') });
loadDotenv({ path: resolve(apiDir, '.env'), override: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function print(step: string, value: unknown) {
  console.log(`\n=== ${step} ===`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function main() {
  const url = arg('--url');
  const target = arg('--target');
  const to = arg('--to');
  const categoryArg = arg('--category');
  const dryRun = process.argv.includes('--dry-run');
  const send = process.argv.includes('--send') && !dryRun;

  if (!url || !target || !to) {
    print(
      'usage',
      'npm run e2e:backlinks -- --url <url> --target <client-url> --to <email> [--category <id>] [--dry-run] [--send]'
    );
    process.exitCode = 1;
    return;
  }

  let targetHost = '';
  try {
    targetHost = new URL(target).hostname;
  } catch {
    print('error', `target is not a URL: ${target}`);
    process.exitCode = 1;
    return;
  }

  print('config', {
    url,
    target,
    to,
    category: categoryArg ?? '(from scan, else unknown)',
    dryRun,
    sendRequested: process.argv.includes('--send'),
    sendWillRun: send,
    ollamaEnabled: String(process.env.OLLAMA_ENABLED ?? ''),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? '',
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || 'llama3.2',
    generationMock: String(process.env.GENERATION_MOCK ?? ''),
    smtpHost: process.env.SMTP_HOST ?? '',
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  });
  if (dryRun && process.argv.includes('--send')) {
    print('send', 'skipped: --dry-run wins over --send. Nothing was sent.');
  }

  const { scanLiveUrl } = await import('../src/modules/backlinks/url-scanner.service.js');
  const { draftWithConfiguredAi, reviewWithConfiguredAi } = await import(
    '../src/modules/backlinks/ai-draft.service.js'
  );
  const {
    approvalReview,
    buildApprovalPrompt,
    acceptBusinessDescription,
    buildBusinessDescriptionPrompt,
    buildDraftPrompt,
    clientLabelFromTarget,
    dedupeDescription,
    deriveNiche,
    groundFormFieldDraft,
    humanStepForChosenMode,
    planBacklinkDraft,
    resolveExecutionMode,
    workflowFor,
  } = await import('@seo-os/backlink-builder');

  const verdict = await scanLiveUrl({ url, category: categoryArg ?? null });
  print('scan', verdict);

  const targetScan = await scanLiveUrl({ url: target, category: null });
  const niche = deriveNiche({
    title: targetScan.title,
    metaDescription: targetScan.metaDescription,
    h1: targetScan.h1,
  });
  const clientLabel = clientLabelFromTarget({ title: targetScan.title || targetScan.h1, hostname: targetHost });
  print('client', {
    targetFinalUrl: targetScan.finalUrl,
    targetTitle: targetScan.title,
    niche: niche || null,
    clientLabel,
    nicheSource: niche ? 'target page title, h1, and meta description' : 'the target page did not provide a title, h1, or description',
  });

  const category = categoryArg || verdict.suggestedCategory || null;
  const workflow = category ? workflowFor(category) : null;
  const mode = !category
    ? { mode: 'stop' as const, reason: `No category. ${verdict.nextAction}` }
    : workflow
      ? resolveExecutionMode(category, verdict)
      : { mode: 'stop' as const, reason: `Unknown category ${category}.` };
  print('workflow', {
    category: category ?? 'unknown',
    catalogMode: workflow?.mode ?? null,
    chosen: mode.mode,
    reason: mode.reason,
    humanStep: humanStepForChosenMode(mode.mode, workflow),
  });

  const pageText = verdict.pageExcerpt || `${verdict.title} ${verdict.h1}`;
  const prompt = buildApprovalPrompt({
    niche,
    pageText,
    url: verdict.finalUrl || url,
    workflowMode: mode.mode,
    workflowReason: mode.reason,
    verdict,
  });
  const ai = await reviewWithConfiguredAi(prompt);
  const review = approvalReview({
    niche,
    title: verdict.title || verdict.finalUrl || url,
    pageText,
    workflowMode: mode.mode === 'stop' ? 'stop' : mode.mode,
    verdict,
    aiText: ai?.text ?? null,
    aiSource: ai?.source ?? null,
  });
  print('approval', {
    decision: review.decision,
    rulesDecision: review.rulesDecision,
    aiVerdict: review.aiVerdict,
    source: review.source,
    summary: review.summary,
    requiresHumanConfirm: review.requiresHumanConfirm,
    relevanceScore: review.relevanceScore,
    checks: review.checks,
    ai: review.ai,
    rawReply: review.rawReply,
    reasons: review.reasons,
    aiConfigured: Boolean(ai),
  });

  const editor = arg('--editor');
  const plan = planBacklinkDraft({
    category,
    mode: mode.mode,
    verdict,
    editorEmail: editor,
  });
  const draftPrompt = buildDraftPrompt({
    plan,
    category: category ?? 'unknown',
    clientLabel,
    niche,
    targetUrl: target,
    pageUrl: verdict.finalUrl || url,
    pageExcerpt: pageText,
  });
  const draft = draftPrompt
    ? await draftWithConfiguredAi(plan.kind, draftPrompt)
    : {
        content: plan.reason,
        provider: null,
        generated: false,
      };
  const wantsDescription =
    plan.kind === 'form_fields' && plan.fieldNames.some((name) => /description|about|summary/i.test(name));
  let businessDescription = wantsDescription ? dedupeDescription(targetScan.metaDescription || '') : '';
  let descriptionSource: 'ollama' | 'meta' | 'none' | null = wantsDescription
    ? businessDescription
      ? 'meta'
      : 'none'
    : null;
  if (wantsDescription) {
    const written = await draftWithConfiguredAi(
      'business description',
      buildBusinessDescriptionPrompt({
        label: clientLabel,
        title: targetScan.title,
        h1: targetScan.h1,
        metaDescription: targetScan.metaDescription,
      })
    );
    const accepted = written.generated ? acceptBusinessDescription(written.content) : null;
    if (accepted) {
      businessDescription = accepted;
      descriptionSource = 'ollama';
    }
  }
  const grounded =
    plan.kind === 'form_fields' && plan.fieldNames.length > 0
      ? groundFormFieldDraft(draft.generated ? draft.content : null, plan.fieldNames, {
          label: clientLabel,
          niche,
          url: target,
          description: businessDescription,
        })
      : null;
  print('draft', {
    kind: plan.kind,
    reason: plan.reason,
    generated: grounded ? true : draft.generated,
    provider: grounded ? grounded.source : draft.provider,
    descriptionSource: plan.kind === 'form_fields' ? descriptionSource : null,
    recipientEmail: plan.recipientEmail,
    recipientName: plan.recipientName ?? (plan.kind === 'outreach_email' ? 'unknown' : null),
    fieldNames: plan.fieldNames,
    content: grounded ? grounded.json : draft.content,
    smtpTestInbox: to,
  });

  if (!send) {
    print('send', dryRun ? 'skipped: --dry-run never sends.' : 'skipped: pass --send to deliver this email. Nothing was sent.');
  } else {
    const { createSmtpEmailProvider, smtpConfigFromEnv } = await import('@seo-os/providers');
    const smtp = smtpConfigFromEnv();
    if (!smtp) {
      print(
        'send',
        'SMTP env is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM. Nothing was sent.'
      );
      process.exitCode = 1;
    } else if (plan.kind !== 'outreach_email' || !draft.generated) {
      print('send', 'Nothing was sent. --send only delivers an outreach email that was actually generated for a real editor.');
      process.exitCode = 1;
    } else {
      const subjectLine = draft.content.split('\n').find((line) => line.trim()) ?? 'Outreach';
      const subject = subjectLine.replace(/^subject:\s*/i, '').slice(0, 180);
      try {
        const result = await createSmtpEmailProvider(smtp).send({
          from: smtp.from,
          to,
          subject,
          bodyText: draft.content,
          bodyHtml: `<pre>${draft.content.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch] ?? ch)}</pre>`,
        });
        print('send', { messageId: result.messageId, from: smtp.from, to });
      } catch (err) {
        print('send', err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    }
  }

  if (dryRun) {
    print('verification', 'skipped: --dry-run does not write a backlink. Nothing was submitted.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    print('verification', 'skipped: DATABASE_URL is not set, so runVerificationCheck was not called.');
    process.exitCode = 1;
    return;
  }

  const { getSupabaseAdmin } = await import('../src/lib/supabase.js');
  const { runVerificationCheck } = await import('../src/modules/backlinks/automation.service.js');
  const admin = getSupabaseAdmin();

  const listed = await admin.from('workspaces').select('id').limit(1);
  if (listed.error) {
    print('verification', { error: listed.error.message ?? listed.error });
    process.exitCode = 1;
    return;
  }
  let workspaceId = listed.data?.[0]?.id ? String(listed.data[0].id) : '';
  if (!workspaceId) {
    const orgId = randomUUID();
    const org = await admin.from('organizations').insert({
      id: orgId,
      name: 'Backlink e2e',
      slug: `backlink-e2e-${Date.now()}`,
    });
    if (org.error) {
      print('verification', { error: org.error.message ?? org.error });
      process.exitCode = 1;
      return;
    }
    workspaceId = randomUUID();
    const created = await admin.from('workspaces').insert({
      id: workspaceId,
      org_id: orgId,
      name: 'Backlink e2e',
      domain: targetHost,
      url: target,
    });
    if (created.error) {
      print('verification', { error: created.error.message ?? created.error });
      process.exitCode = 1;
      return;
    }
  }

  const opportunityId = randomUUID();
  const backlinkId = randomUUID();
  const sourceUrl = verdict.finalUrl || url;
  let sourceHost = targetHost;
  try {
    sourceHost = new URL(sourceUrl).hostname;
  } catch {
    sourceHost = targetHost;
  }
  const backlinkType = workflow ? category : 'directory';
  const opportunity = await admin.from('opportunities').insert({
    id: opportunityId,
    workspace_id: workspaceId,
    opportunity_type: backlinkType,
    title: `e2e ${backlinkType}`,
    url: sourceUrl,
    domain: sourceHost,
    metrics_source: 'unknown',
    discovery_source: 'manual',
  });
  if (opportunity.error) {
    print('verification', { error: opportunity.error.message ?? opportunity.error });
    process.exitCode = 1;
    return;
  }
  const backlink = await admin.from('backlinks').insert({
    id: backlinkId,
    workspace_id: workspaceId,
    opportunity_id: opportunityId,
    backlink_type: backlinkType,
    source_url: sourceUrl,
    target_url: target,
    domain: sourceHost,
    verification_status: 'pending',
  });
  if (backlink.error) {
    print('verification', { error: backlink.error.message ?? backlink.error });
    process.exitCode = 1;
    return;
  }

  const check = await runVerificationCheck(workspaceId, backlinkId, { attempt: 0 });
  const stored = await admin
    .from('backlinks')
    .select('verification_status, verified_at')
    .eq('id', backlinkId)
    .single();
  const workersOn = String(process.env.ENABLE_WORKERS ?? '').toLowerCase() === 'true';
  print('verification', {
    outcome: check.outcome,
    targetFound: check.details.targetFound,
    httpStatus: check.details.httpStatus,
    follow: check.follow,
    retryQueued: check.follow.action === 'retry' ? workersOn : false,
    retryNote:
      check.follow.action === 'retry' && !workersOn
        ? 'ENABLE_WORKERS is not true, so the retry job was not queued. The row stays pending.'
        : undefined,
    verification_status: stored.data?.verification_status ?? null,
    verified_at: stored.data?.verified_at ?? null,
    backlinkId,
    workspaceId,
  });
}

main().catch((err) => {
  print('error', err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
