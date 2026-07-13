import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';

function MediaStudio({ kind }: { kind: 'image' | 'video' }) {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [opportunityId, setOpportunityId] = useState('');

  const list = useQuery({
    queryKey: ['media-briefs', projectId, kind],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          review_status: string;
          brief: { suggestions?: unknown[]; note?: string; generationStatus?: string };
          opportunities?: { title?: string; domain?: string };
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/media-briefs?kind=${kind}`),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}/media-briefs`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      }),
    onSuccess: () => {
      toast.success(`${kind} brief queued for review`);
      qc.invalidateQueries({ queryKey: ['media-briefs', projectId, kind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: ({ id, reviewStatus }: { id: string; reviewStatus: 'approved' | 'rejected' }) =>
      request(`/v1/projects/${projectId}/backlink-builder/media-briefs/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewStatus }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-briefs', projectId, kind] }),
  });

  const Icon = kind === 'image' ? ImageIcon : VideoIcon;

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 capitalize">
          <Icon className="h-6 w-6" /> {kind} Submission Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Metadata, prompts, and review queue only. Pixel/video render requires a provider (later).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate brief</CardTitle>
          <CardDescription>Creates editable metadata for user review.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input
            className="max-w-md"
            placeholder="Opportunity UUID"
            value={opportunityId}
            onChange={(e) => setOpportunityId(e.target.value)}
          />
          <Button disabled={!opportunityId || create.isPending} onClick={() => create.mutate()}>
            Queue {kind} brief
          </Button>
          <Button disabled title="V1.1 — provider required">
            Generate {kind} asset
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {(list.data?.data ?? []).map((b) => (
          <Card key={b.id}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">{b.opportunities?.title ?? 'Brief'}</p>
                  <p className="text-xs text-muted-foreground">{b.opportunities?.domain}</p>
                </div>
                <Badge className="text-[10px]">{b.review_status}</Badge>
              </div>
              <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-auto max-h-40">
                {JSON.stringify(b.brief, null, 2)}
              </pre>
              {b.review_status === 'queued' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => review.mutate({ id: b.id, reviewStatus: 'approved' })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review.mutate({ id: b.id, reviewStatus: 'rejected' })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageTransition>
  );
}

export function ImageStudioPage() {
  return <MediaStudio kind="image" />;
}

export function VideoStudioPage() {
  return <MediaStudio kind="video" />;
}
