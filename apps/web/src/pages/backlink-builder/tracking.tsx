import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { OpportunityLogo } from '@/components/backlink-builder/opportunity-logo';
import { formatType, scoreBadgeClass } from '@/components/backlink-builder/types';
import { PageTransition } from '@/components/demo/page-transition';
import { Activity, Send, CheckCircle, XCircle } from 'lucide-react';

const STATUS_FILTERS = [
  'all',
  'imported',
  'analyzed',
  'qualified',
  'prepared',
  'submitted',
  'waiting',
  'published',
  'verified',
  'rejected',
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
  assisted_mode?: string;
  opportunities?: { id: string; title: string; domain?: string };
};

export function BacklinkTrackingPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');

  const tracking = useQuery({
    queryKey: ['automation-tracking', projectId, filter],
    queryFn: () => {
      const qs = filter !== 'all' ? `?status=${filter}` : '';
      return request<{ data: TrackingItem[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/tracking${qs}`
      );
    },
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

  return (
    <PageTransition className="space-y-6">
      <BacklinkBuilderNav />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Activity className="h-6 w-6" /> Opportunity Tracking
        </h1>
        <p className="text-muted-foreground mt-1">
          Track every imported opportunity from analysis through verification
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
            className="capitalize text-xs"
          >
            {s}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Imported Opportunities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tracking.data?.data ?? []).map((item) => (
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
              {item.priority && (
                <Badge className="text-[10px] capitalize border-muted-foreground/30">
                  {item.priority}
                </Badge>
              )}
              <Badge className={`text-[10px] ${scoreBadgeClass(item.score)}`}>{item.score}</Badge>
            </Link>
          ))}
          {!tracking.data?.data?.length && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tracked opportunities.{' '}
              <Link
                to={`/projects/${projectId}/backlink-builder/import`}
                className="text-primary hover:underline"
              >
                Import websites
              </Link>{' '}
              to begin.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Submissions (Semi-Automation)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(submissions.data?.data ?? []).map((sub) => (
            <div key={sub.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <div className="flex-1">
                <p className="font-medium">{sub.opportunities?.title ?? 'Submission'}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {sub.assisted_mode ?? 'manual'} · {sub.status}
                </p>
              </div>
              <Badge className="text-[10px] capitalize">{sub.status}</Badge>
              {sub.status === 'prepared' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateSubmission.mutate({ id: sub.id, status: 'submitted' })}
                >
                  <Send className="h-3 w-3 mr-1" /> Mark Submitted
                </Button>
              )}
              {sub.status === 'submitted' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateSubmission.mutate({ id: sub.id, status: 'published' })}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Published
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateSubmission.mutate({ id: sub.id, status: 'rejected' })}
                  >
                    <XCircle className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
