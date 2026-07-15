import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

function MediaStudio({ kind }: { kind: 'image' | 'video' }) {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const handleSelect = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

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
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved website first');
      return request(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${selectedOpp.id}/media-briefs`,
        {
          method: 'POST',
          body: JSON.stringify({ kind }),
        }
      );
    },
    onSuccess: () => {
      toast.success(`${kind} brief queued for ${selectedOpp?.website ?? 'website'}`);
      qc.invalidateQueries({ queryKey: ['media-briefs', projectId, kind] });
      qc.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
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
  const briefs = (list.data?.data ?? []).filter((b) => {
    if (!selectedOpp) return true;
    const domain = b.opportunities?.domain?.toLowerCase();
    const title = b.opportunities?.title?.toLowerCase();
    return (
      domain === selectedOpp.domain?.toLowerCase() ||
      title === selectedOpp.website.toLowerCase() ||
      title === selectedOpp.title?.toLowerCase()
    );
  });

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 capitalize">
          <Icon className="h-6 w-6" /> {kind} Submission Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select an approved website to generate metadata briefs. Pixel/video render requires a
          provider (later).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate brief</CardTitle>
          <CardDescription>
            Choose a website — content type and site context load automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelect}
            mode="content"
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selectedOpp || create.isPending} onClick={() => create.mutate()}>
              Queue {kind} brief
              {selectedOpp ? ` for ${selectedOpp.website}` : ''}
            </Button>
            <Button disabled title="V1.1 — provider required">
              Generate {kind} asset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {briefs.map((b) => (
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
        {briefs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedOpp
              ? `No ${kind} briefs yet for ${selectedOpp.website}.`
              : `No ${kind} briefs yet.`}
          </p>
        )}
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
