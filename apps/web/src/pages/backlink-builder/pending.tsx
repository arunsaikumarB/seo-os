import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkRecord } from '@/components/backlink-builder/types';
import { formatType } from '@/components/backlink-builder/types';
import { Clock, CheckCircle, RefreshCw, History } from 'lucide-react';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

type CheckRow = {
  id: string;
  outcome?: string;
  http_status?: number;
  created_at: string;
  details?: Record<string, unknown>;
};

export function BacklinkPendingPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const handleSelectOpp = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

  const pending = useQuery({
    queryKey: ['backlink-pending', projectId],
    queryFn: () =>
      request<{ data: BacklinkRecord[] }>(`/v1/projects/${projectId}/backlink-builder/pending`),
    enabled: !!projectId,
  });

  const checks = useQuery({
    queryKey: ['backlink-checks', projectId, historyId],
    queryFn: () =>
      request<{ data: CheckRow[] }>(
        `/v1/projects/${projectId}/backlink-builder/backlinks/${historyId}/checks`
      ),
    enabled: !!projectId && !!historyId,
  });

  const verifyManual = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'verified' | 'lost' | 'unreachable' }) =>
      request(`/v1/projects/${projectId}/backlink-builder/backlinks/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Verification updated');
      queryClient.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-summary', projectId] });
    },
  });

  const verifyHttp = useMutation({
    mutationFn: (id: string) =>
      request<{ data: { outcome: string; details?: { targetFound?: boolean; httpStatus?: number } } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/verification/${id}/check`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      toast.success(`HTTP check: ${res.data.outcome}`);
      queryClient.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-checks', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Verification failed'),
  });

  const pendingLinks = useMemo(() => {
    const rows = pending.data?.data ?? [];
    if (!selectedOpp) return rows;
    const domain = selectedOpp.domain?.toLowerCase();
    return rows.filter(
      (bl) =>
        bl.domain?.toLowerCase() === domain ||
        bl.source_url?.toLowerCase().includes(domain ?? '') ||
        bl.target_url?.toLowerCase().includes(selectedOpp.website.toLowerCase())
    );
  }, [pending.data?.data, selectedOpp]);

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Verification"
        subtitle="Real HTTP fetch of the source URL — checks status, target presence, anchor match, and nofollow heuristics. Loss events notify via platform notifications."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Focus website</CardTitle>
          <CardDescription>
            Filter verification work by approved website. Leave empty to see all pending links.
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending links</CardTitle>
          <CardDescription>
            Run automated HTTP verification or mark outcomes manually after review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {pendingLinks.map((bl) => (
            <Card key={bl.id}>
              <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                    {bl.domain}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{bl.source_url}</p>
                  <p className="text-xs text-muted-foreground truncate">→ {bl.target_url}</p>
                  <Badge className="text-[10px] capitalize">{formatType(bl.backlink_type)}</Badge>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    disabled={verifyHttp.isPending}
                    onClick={() => verifyHttp.mutate(bl.id)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> HTTP verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verifyManual.isPending}
                    onClick={() => verifyManual.mutate({ id: bl.id, status: 'verified' })}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Manual OK
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHistoryId(historyId === bl.id ? null : bl.id)}
                  >
                    <History className="h-3 w-3 mr-1" /> History
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={verifyManual.isPending}
                    onClick={() => verifyManual.mutate({ id: bl.id, status: 'lost' })}
                  >
                    Mark lost
                  </Button>
                </div>
              </CardContent>
              {historyId === bl.id && (
                <CardContent className="pt-0 pb-4 space-y-1">
                  {checks.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading checks…</p>
                  ) : (checks.data?.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No check history yet.</p>
                  ) : (
                    (checks.data?.data ?? []).map((c) => (
                      <p key={c.id} className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()} — {c.outcome ?? 'check'}
                        {c.http_status != null ? ` (HTTP ${c.http_status})` : ''}
                      </p>
                    ))
                  )}
                </CardContent>
              )}
            </Card>
          ))}
          {pendingLinks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {selectedOpp
                ? `No pending verifications for ${selectedOpp.website}.`
                : 'No pending verifications.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
