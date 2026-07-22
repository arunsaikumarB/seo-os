import {
  BACKLINK_TYPES,
  buildIntelligentContentPlan,
  detectSubmissionRequirements,
  websiteRowStatus,
  type ExecutionPublicStatus,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export type OpportunityReadiness =
  | 'ready'
  | 'starting'
  | 'running'
  | 'waiting_human'
  | 'completed'
  | 'verified'
  | 'failed'
  | 'failed_to_start'
  | 'skipped'
  | 'deleted'
  | 'in_progress'
  | 'needs_approval'
  | 'needs_domain'
  | 'not_ready';

function readinessFromPublic(pub: ExecutionPublicStatus): OpportunityReadiness {
  switch (pub) {
    case 'Ready':
      return 'ready';
    case 'Starting':
    case 'Queued':
      return 'starting';
    case 'Running':
      return 'running';
    case 'Waiting Human':
      return 'waiting_human';
    case 'Completed':
    case 'Submitted':
      return 'completed';
    case 'Verified':
    case 'Approved':
      return 'verified';
    case 'Failed to Start':
      return 'failed_to_start';
    case 'Failed':
    case 'Rejected':
      return 'failed';
    case 'Skipped':
      return 'skipped';
    case 'Deleted':
    case 'Ignored':
      return 'deleted';
    default:
      return 'ready';
  }
}

function typeMeta(opportunityType: string) {
  const hit = BACKLINK_TYPES.find((t) => t.id === opportunityType);
  return {
    category: hit?.category ?? 'business_based',
    displayName: hit?.displayName ?? opportunityType.replace(/_/g, ' '),
  };
}

/**
 * Shared approved / campaign-ready opportunity loader for Execution Center,
 * Content Studio, and other workflow pickers. UUID is for API use only.
 */
export async function listApprovedOpportunities(workspaceId: string) {
  const { data: opps, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, title, domain, website_name, url, opportunity_type, backlink_category, score, domain_rating, monthly_traffic, status, queue_status, pipeline_stage, automation_status, campaign_lifecycle, generation_status, blocker_reason, metadata, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .or(
      [
        'campaign_lifecycle.eq.Ready',
        'campaign_lifecycle.eq.Submitting',
        'campaign_lifecycle.eq.Waiting Human',
        'campaign_lifecycle.eq.Retrying',
        'campaign_lifecycle.eq.Package Generated',
        'queue_status.eq.approved',
        'status.eq.approved',
        'pipeline_stage.eq.campaign_ready',
        'pipeline_stage.eq.outreach',
      ].join(',')
    )
    .order('score', { ascending: false })
    .limit(200);
  if (error) throw error;

  const ids = (opps ?? []).map((o) => o.id);
  const jobsByOpp = new Map<
    string,
    {
      id: string;
      status: string;
      created_at: string;
      site_domain?: string | null;
      disposition?: string | null;
      error_code?: string | null;
      error_message?: string | null;
    }
  >();
  const packByOpp = new Set<string>();

  if (ids.length) {
    const [{ data: jobs }, { data: packs }] = await Promise.all([
      getSupabaseAdmin()
        .from('execution_jobs')
        .select(
          'id, opportunity_id, status, created_at, site_domain, disposition, error_code, error_message, metrics'
        )
        .eq('workspace_id', workspaceId)
        .in('opportunity_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      getSupabaseAdmin()
        .from('content_packs')
        .select('opportunity_id')
        .eq('workspace_id', workspaceId)
        .in('opportunity_id', ids),
    ]);

    for (const job of jobs ?? []) {
      const oppId = String(job.opportunity_id);
      if (!jobsByOpp.has(oppId)) {
        const metrics = job.metrics as { disposition?: string } | null;
        jobsByOpp.set(oppId, {
          id: String(job.id),
          status: String(job.status),
          created_at: String(job.created_at),
          site_domain: job.site_domain as string | null,
          disposition:
            (job.disposition as string | null) ?? metrics?.disposition ?? null,
          error_code: (job.error_code as string | null) ?? null,
          error_message: (job.error_message as string | null) ?? null,
        });
      }
    }
    for (const pack of packs ?? []) {
      if (pack.opportunity_id) packByOpp.add(String(pack.opportunity_id));
    }
  }

  return (opps ?? [])
    .filter((opp) => {
      // Delete Forever — never show on Submit Backlinks / project pickers
      const auto = String(opp.automation_status ?? '');
      if (auto === 'deleted' || auto === 'ignored') return false;
      const latest = jobsByOpp.get(String(opp.id));
      if (latest && (latest.status === 'deleted' || latest.status === 'ignored')) return false;
      return true;
    })
    .map((opp) => {
    const meta = (opp.metadata as Record<string, unknown>) ?? {};
    const workflow =
      typeof meta.workflow === 'object' && meta.workflow
        ? (meta.workflow as Record<string, unknown>)
        : {};
    const latestJob = jobsByOpp.get(String(opp.id)) ?? null;
    const website = String(opp.website_name || opp.domain || opp.title || 'Unknown site');
    const hasDomain = Boolean(opp.domain || opp.url);
    const typeInfo = typeMeta(String(opp.opportunity_type));
    const category = String(opp.backlink_category || typeInfo.category);
    const classification =
      typeof meta.classification === 'object' && meta.classification
        ? (meta.classification as Record<string, unknown>)
        : {};
    const contentIntel =
      typeof meta.contentIntelligence === 'object' && meta.contentIntelligence
        ? (meta.contentIntelligence as Record<string, unknown>)
        : {};
    const classificationId =
      (classification.id as string) ||
      (classification.type as string) ||
      (contentIntel.detectedType as string) ||
      null;
    const plan = buildIntelligentContentPlan({
      classificationId,
      classificationLabel:
        (classification.displayName as string) ||
        (classification.label as string) ||
        (contentIntel.detectedTypeLabel as string) ||
        null,
      opportunityType: String(
        contentIntel.storageType || classification.storageType || opp.opportunity_type
      ),
      workflowQueue:
        (classification.workflowQueue as string) ||
        (meta.workflowQueue as string) ||
        null,
      confidence: Number(classification.confidence ?? contentIntel.confidence ?? 0),
      reason: String(classification.reason ?? contentIntel.reason ?? ''),
      domain: opp.domain as string | null,
      websiteName: opp.website_name as string | null,
    });
    const requirements = detectSubmissionRequirements(plan.storageType, {
      url: opp.url ? String(opp.url) : undefined,
    });
    if (Array.isArray(plan.requirements.requiredFields) && plan.requirements.requiredFields.length) {
      requirements.requiredFields = [
        ...new Set([...requirements.requiredFields, ...plan.requirements.requiredFields]),
      ];
    }

    const campaignEligible =
      opp.campaign_lifecycle === 'Ready' ||
      opp.campaign_lifecycle === 'Submitting' ||
      opp.campaign_lifecycle === 'Waiting Human' ||
      opp.campaign_lifecycle === 'Retrying' ||
      opp.campaign_lifecycle === 'Package Generated' ||
      workflow.campaign_eligible === true ||
      workflow.execution_ready === true ||
      opp.pipeline_stage === 'campaign_ready' ||
      opp.pipeline_stage === 'outreach' ||
      opp.queue_status === 'approved';

    let rowStatus: ExecutionPublicStatus = 'Ready';
    let readiness: OpportunityReadiness = 'not_ready';
    if (latestJob) {
      rowStatus = websiteRowStatus(latestJob.status, latestJob.disposition);
      readiness = readinessFromPublic(rowStatus);
    } else if (!hasDomain) {
      readiness = 'needs_domain';
      rowStatus = 'Ready';
    } else if (opp.campaign_lifecycle === 'Ready' || campaignEligible) {
      readiness = 'ready';
      rowStatus = 'Ready';
    }

    const selectable =
      readiness === 'ready' ||
      readiness === 'failed' ||
      readiness === 'failed_to_start' ||
      readiness === 'completed';

    return {
      id: opp.id,
      website,
      domain: opp.domain ?? null,
      title: opp.title,
      score: Number(opp.score ?? 0),
      opportunity_type: opp.opportunity_type,
      storage_type: plan.storageType,
      classification_id: plan.detectedType,
      classification_label: plan.detectedTypeLabel,
      studio_mode: plan.mode,
      studio_mode_label: plan.modeLabel,
      workflow_queue: classification.workflowQueue ?? meta.workflowQueue ?? plan.mode,
      classification_confidence: plan.confidence,
      open_image_studio: plan.openImageStudio,
      open_video_studio: plan.openVideoStudio,
      backlink_type: plan.detectedTypeLabel || typeInfo.displayName,
      category,
      domain_rating: opp.domain_rating != null ? Number(opp.domain_rating) : null,
      monthly_traffic: opp.monthly_traffic != null ? Number(opp.monthly_traffic) : null,
      status: opp.queue_status || opp.status,
      pipeline_stage: opp.pipeline_stage,
      readiness,
      /** ESM public website status — sole badge source for Submit Backlinks */
      rowStatus,
      error_message: latestJob?.error_message ?? null,
      /** Execution Center: whether Start Execution is allowed */
      selectable,
      /** Content Studio / media: any approved row may generate packs */
      content_selectable: true,
      required_fields: requirements.requiredFields,
      requirements: {
        loginRequired: requirements.loginRequired,
        captchaRequired: requirements.captchaRequired,
        emailVerifyRequired: requirements.emailVerifyRequired,
        mediaRequirements: requirements.mediaRequirements,
        contactDetails: requirements.contactDetails,
      },
      has_submission: Boolean(meta.submission_id || workflow.submission_id),
      has_content_draft: Boolean(
        meta.content_studio_draft_id || workflow.content_studio_draft_id
      ),
      has_content_pack: packByOpp.has(String(opp.id)),
      latest_job: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            created_at: latestJob.created_at,
            disposition: latestJob.disposition ?? null,
            error_message: latestJob.error_message ?? null,
          }
        : null,
    };
  });
}
