import {
  BACKLINK_TYPES,
  detectSubmissionRequirements,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const ACTIVE_JOB_STATUSES = new Set([
  'queued',
  'preparing',
  'running',
  'paused',
  'needs_approval',
  'ready_for_review',
  'ready_to_continue',
  'watching_captcha',
  'watching_login',
  'watching_mfa',
  'watching_email',
  'watching_phone',
  'blocked_captcha',
  'blocked_mfa',
]);

export type OpportunityReadiness =
  | 'ready'
  | 'in_progress'
  | 'needs_approval'
  | 'completed'
  | 'failed'
  | 'needs_domain'
  | 'not_ready';

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
      'id, title, domain, website_name, url, opportunity_type, backlink_category, score, domain_rating, monthly_traffic, status, queue_status, pipeline_stage, automation_status, metadata, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .or(
      'queue_status.eq.approved,status.eq.approved,pipeline_stage.eq.campaign_ready,pipeline_stage.eq.outreach'
    )
    .order('score', { ascending: false })
    .limit(200);
  if (error) throw error;

  const ids = (opps ?? []).map((o) => o.id);
  const jobsByOpp = new Map<
    string,
    { id: string; status: string; created_at: string; site_domain?: string | null }
  >();
  const packByOpp = new Set<string>();

  if (ids.length) {
    const [{ data: jobs }, { data: packs }] = await Promise.all([
      getSupabaseAdmin()
        .from('execution_jobs')
        .select('id, opportunity_id, status, created_at, site_domain')
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
        jobsByOpp.set(oppId, {
          id: String(job.id),
          status: String(job.status),
          created_at: String(job.created_at),
          site_domain: job.site_domain as string | null,
        });
      }
    }
    for (const pack of packs ?? []) {
      if (pack.opportunity_id) packByOpp.add(String(pack.opportunity_id));
    }
  }

  return (opps ?? []).map((opp) => {
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
    const requirements = detectSubmissionRequirements(String(opp.opportunity_type), {
      url: opp.url ? String(opp.url) : undefined,
    });

    const campaignEligible =
      workflow.campaign_eligible === true ||
      workflow.execution_ready === true ||
      opp.pipeline_stage === 'campaign_ready' ||
      opp.pipeline_stage === 'outreach' ||
      opp.queue_status === 'approved';

    let readiness: OpportunityReadiness = 'not_ready';
    if (latestJob) {
      const st = latestJob.status;
      if (st === 'completed') readiness = 'completed';
      else if (st === 'failed' || st === 'cancelled') readiness = 'failed';
      else if (st === 'needs_approval' || st === 'ready_for_review') readiness = 'needs_approval';
      else if (ACTIVE_JOB_STATUSES.has(st)) readiness = 'in_progress';
      else readiness = 'ready';
    } else if (!hasDomain) {
      readiness = 'needs_domain';
    } else if (campaignEligible) {
      readiness = 'ready';
    }

    const selectable =
      readiness === 'ready' || readiness === 'failed' || readiness === 'completed';

    return {
      id: opp.id,
      website,
      domain: opp.domain ?? null,
      title: opp.title,
      score: Number(opp.score ?? 0),
      opportunity_type: opp.opportunity_type,
      backlink_type: typeInfo.displayName,
      category,
      domain_rating: opp.domain_rating != null ? Number(opp.domain_rating) : null,
      monthly_traffic: opp.monthly_traffic != null ? Number(opp.monthly_traffic) : null,
      status: opp.queue_status || opp.status,
      pipeline_stage: opp.pipeline_stage,
      readiness,
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
          }
        : null,
    };
  });
}
