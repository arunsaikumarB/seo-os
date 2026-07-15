import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { OpportunityLogo } from '@/components/backlink-builder/opportunity-logo';
import { formatType, scoreBadgeClass } from '@/components/backlink-builder/types';
import { PageTransition } from '@/components/demo/page-transition';
import { ClipboardList, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';

const STATUS_FILTERS = [
  'all',
  'ready',
  'awaiting_approval',
  'submitted',
  'pending_review',
  'accepted',
  'rejected',
  'failed',
  'verified',
] as const;

type TrackingItem = {
  id: string;
  title: string;
  domain?: string;
  opportunity_type: string;
  automation_status: string;
  pipeline_stage?: string;
  score: number;
  priority?: string;
  recommended_action?: string;
  created_at: string;
};

type Submission = {
  id: string;
  status: string;
  tracking_status?: string;
  assisted_mode?: string;
  estimated_review_hours?: number;
  estimated_approval_hours?: number;
  estimatedReviewHours?: number;
  estimatedApprovalHours?: number;
  prefill_payload?: Record<string, unknown>;
  opportunities?: { id: string; title: string; domain?: string; opportunity_type?: string };
};

export function BacklinkTrackingPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const { opportunity: selectedOpp, setOpportunity: handleSelectOpp } =
    useCurrentOpportunity(projectId);

  const tracking = useQuery({
    queryKey: ['automation-tracking', projectId],
    queryFn: () =>
      request<{ data: TrackingItem[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/tracking`
      ),
    enabled: !!projectId,
  });

  const submissions = useQuery({
    queryKey: ['automation-submissions', projectId],
    queryFn: () =>
      request<{ data: Submission[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/submissions`
      ),
    enabled: !!projectId,
  });

  const updateSubmission = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      request(`/v1/projects/${projectId}/backlink-builder/automation/submissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['automation-tracking', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automation-submissions', projectId] });
    },
  });

  const filteredSubs = useMemo(() => {
    return (submissions.data?.data ?? []).filter((s) => {
      if (selectedOpp) {
        const oppId = s.opportunities?.id;
        const domain = s.opportunities?.domain?.toLowerCase();
        const match =
          oppId === selectedOpp.id ||
          domain === selectedOpp.domain?.toLowerCase() ||
          s.opportunities?.title?.toLowerCase() === selectedOpp.website.toLowerCase();
        if (!match) return false;
      }
      if (filter === 'all') return true;
      const st = s.tracking_status ?? s.status;
      if (filter === 'ready') return st === 'ready' || st === 'prepared';
      return st === filter;
    });
  }, [submissions.data?.data, filter, selectedOpp]);

  const filteredTracking = useMemo(() => {
    const rows = tracking.data?.data ?? [];
    if (!selectedOpp) return rows.slice(0, 20);
    return rows
      .filter(
        (item) =>
          item.id === selectedOpp.id ||
          item.domain?.toLowerCase() === selectedOpp.domain?.toLowerCase() ||
          item.title?.toLowerCase() === selectedOpp.website.toLowerCase()
      )
      .slice(0, 20);
  }, [tracking.data?.data, selectedOpp]);

  return (
    <PageTransition className="space-y-6">
      <BacklinkBuilderNav />
      <CurrentOpportunityBanner projectId={projectId} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-6 w-6" /> Submission Center
        </h1>
        <p className="text-muted-foreground mt-1">
          Prefill payloads and assisted submission statuses. Confirm external submission yourself —
          never bypass third-party auth or CAPTCHA.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Focus website</CardTitle>
          <CardDescription>
            Filter submissions by approved website. Leave empty to see all.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelectOpp}
            mode="content"
            showTable={false}
            showRequiredFields={false}
            allowClear
            label="Website filter"
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
            className="capitalize text-xs"
          >
            {s.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Submissions</CardTitle>
          <CardDescription>
            Review/approval times are Estimated heuristics by opportunity type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredSubs.map((sub) => {
            const reviewHrs = sub.estimatedReviewHours ?? sub.estimated_review_hours;
            const approvalHrs = sub.estimatedApprovalHours ?? sub.estimated_approval_hours;
            const prefill = sub.prefill_payload;
            return (
              <div key={sub.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {sub.opportunities?.title ?? 'Submission'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {sub.opportunities?.domain} · {sub.assisted_mode ?? 'manual'} ·{' '}
                      {sub.tracking_status ?? sub.status}
                    </p>
                  </div>
                  <Badge className="text-[10px] capitalize">
                    {(sub.tracking_status ?? sub.status).replace(/_/g, ' ')}
                  </Badge>
                  {reviewHrs != null && (
                    <Badge className="text-[10px] border-muted-foreground/30">
                      <Clock className="h-3 w-3 mr-1" /> Est. review {reviewHrs}h
                    </Badge>
                  )}
                  {approvalHrs != null && (
                    <Badge className="text-[10px] border-muted-foreground/30">
                      Est. approval {approvalHrs}h
                    </Badge>
                  )}
                </div>
                {prefill && (
                  <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-24">
                    {JSON.stringify(prefill, null, 2)}
                  </pre>
                )}
                <div className="flex flex-wrap gap-2">
                  {(sub.status === 'prepared' || sub.tracking_status === 'ready') && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateSubmission.mutate({ id: sub.id, status: 'awaiting_approval' })
                        }
                      >
                        Send for approval
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateSubmission.mutate({ id: sub.id, status: 'submitted' })}
                      >
                        <Send className="h-3 w-3 mr-1" /> Confirm submitted externally
                      </Button>
                    </>
                  )}
                  {(sub.status === 'submitted' || sub.tracking_status === 'submitted') && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateSubmission.mutate({ id: sub.id, status: 'pending_review' })
                        }
                      >
                        Pending review
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateSubmission.mutate({ id: sub.id, status: 'accepted' })}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Accepted
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateSubmission.mutate({ id: sub.id, status: 'rejected' })}
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateSubmission.mutate({ id: sub.id, status: 'failed' })}
                      >
                        Failed
                      </Button>
                    </>
                  )}
                  {(sub.status === 'accepted' || sub.tracking_status === 'accepted') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateSubmission.mutate({ id: sub.id, status: 'verified' })}
                    >
                      Mark verified
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredSubs.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No submissions yet.{' '}
              <Link
                to={`/projects/${projectId}/backlink-builder/import`}
                className="text-primary hover:underline"
              >
                Import websites
              </Link>{' '}
              and run automation.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Opportunity queue snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredTracking.map((item) => (
            <Link
              key={item.id}
              to={`/projects/${projectId}/backlink-builder/opportunities/${item.id}`}
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
            >
              <OpportunityLogo domain={item.domain} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.domain} · {formatType(item.opportunity_type)}
                </p>
              </div>
              <Badge className="text-[10px] capitalize">{item.automation_status}</Badge>
              <Badge className={`text-[10px] ${scoreBadgeClass(item.score)}`}>{item.score}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
