import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';
import {
  ImageGenerationReadinessPanel,
  useImageGenerationReadiness,
} from '@/components/images/image-generation-readiness';

const IMAGE_TYPES = [
  'blog_hero',
  'featured_image',
  'open_graph',
  'directory_logo',
  'guest_post_banner',
  'thumbnail',
];

function MediaStudio({ kind }: { kind: 'image' | 'video' }) {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const [imageType, setImageType] = useState('blog_hero');
  const handleSelect = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

  const readiness = useImageGenerationReadiness(projectId, selectedOpp?.id);
  const ready = readiness.data?.data;

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

  const jobs = useQuery({
    queryKey: ['image-jobs', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          status: string;
          provider_key?: string;
          created_at: string;
          error_message?: string | null;
          result?: Record<string, unknown> | null;
        }>;
      }>(`/v1/projects/${projectId}/images/jobs`),
    enabled: !!projectId && kind === 'image',
    refetchInterval: 5_000,
  });

  const assets = useQuery({
    queryKey: ['iie-images', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          status: string;
          image_type: string;
          provider_key: string;
          quality_scores?: { overall?: number; pass?: boolean };
          rejected_reason?: string | null;
          opportunity_id?: string | null;
          created_at: string;
        }>;
      }>(`/v1/projects/${projectId}/images`),
    enabled: !!projectId && kind === 'image',
    refetchInterval: 5_000,
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
      qc.invalidateQueries({ queryKey: ['image-readiness', projectId] });
      qc.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAsset = useMutation({
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved website first');
      if (!ready?.imageGenerationReady) {
        throw new Error(ready?.primaryBlocker?.reason ?? 'Image generation is not ready');
      }
      return request<{ data: { jobs: Array<{ jobId: string; assetId: string }> } }>(
        `/v1/projects/${projectId}/images/generate`,
        {
          method: 'POST',
          body: JSON.stringify({
            opportunityId: selectedOpp.id,
            imageType,
            count: 1,
            providerKey: ready.defaultProviderKey ?? undefined,
          }),
        }
      );
    },
    onSuccess: (res) => {
      toast.success(
        `Generation queued (${res.data.jobs?.[0]?.jobId ? 'worker started' : 'job created'})`
      );
      qc.invalidateQueries({ queryKey: ['image-jobs', projectId] });
      qc.invalidateQueries({ queryKey: ['iie-images', projectId] });
      qc.invalidateQueries({ queryKey: ['image-readiness', projectId] });
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

  const reviewAsset = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      request(`/v1/projects/${projectId}/images/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Asset review saved');
      qc.invalidateQueries({ queryKey: ['iie-images', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  const relatedAssets = useMemo(() => {
    const rows = assets.data?.data ?? [];
    if (!selectedOpp) return rows.slice(0, 12);
    return rows.filter((a) => a.opportunity_id === selectedOpp.id).slice(0, 12);
  }, [assets.data?.data, selectedOpp]);

  const recentJobs = (jobs.data?.data ?? []).slice(0, 8);
  const generateDisabledReason = !selectedOpp
    ? 'Select an approved website first'
    : !ready?.imageGenerationReady
      ? ready?.primaryBlocker?.reason ?? 'Image generation is not ready'
      : generateAsset.isPending
        ? 'Queuing…'
        : null;

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 capitalize">
          <Icon className="h-6 w-6" /> {kind} Submission Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {kind === 'image'
            ? 'Select website → generate brief → generate asset → quality review → approve.'
            : 'Select an approved website to generate video metadata briefs.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select website & generate brief</CardTitle>
          <CardDescription>
            Opportunity context loads automatically. Queue a brief before generating assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelect}
            mode="content"
            showTable={false}
          />
          {kind === 'image' && (
            <div className="space-y-1">
              <Label htmlFor="image-type">Image type</Label>
              <select
                id="image-type"
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={imageType}
                onChange={(e) => setImageType(e.target.value)}
              >
                {IMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button disabled={!selectedOpp || create.isPending} onClick={() => create.mutate()}>
            Queue {kind} brief
            {selectedOpp ? ` for ${selectedOpp.website}` : ''}
          </Button>
        </CardContent>
      </Card>

      {kind === 'image' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Image generation readiness</CardTitle>
            <CardDescription>
              Generate Image Asset enables automatically when every check passes — no page reload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageGenerationReadinessPanel
              projectId={projectId}
              opportunityId={selectedOpp?.id}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={Boolean(generateDisabledReason)}
                title={generateDisabledReason ?? 'Generate Image Asset'}
                onClick={() => generateAsset.mutate()}
              >
                {generateAsset.isPending ? 'Queuing…' : 'Generate Image Asset'}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/projects/${projectId}/providers`}>Open Provider Settings</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/projects/${projectId}/diagnostics`}>Diagnostics</Link>
              </Button>
            </div>
            {generateDisabledReason && (
              <p className="text-xs text-amber-700">{generateDisabledReason}</p>
            )}
          </CardContent>
        </Card>
      )}

      {kind === 'image' && recentJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generation progress</CardTitle>
            <CardDescription>Live job status from the image worker</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentJobs.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium capitalize">{j.provider_key ?? 'provider'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(j.created_at).toLocaleString()}
                    {j.error_message ? ` · ${j.error_message}` : ''}
                  </p>
                </div>
                <Badge className="text-[10px] capitalize">{j.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {kind === 'image' && relatedAssets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Quality review</CardTitle>
            <CardDescription>
              Resolution, brand, logo, aspect ratio, and metadata run automatically after generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {relatedAssets.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium capitalize">{a.image_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.provider_key}
                    {a.quality_scores?.overall != null
                      ? ` · quality ${a.quality_scores.overall}`
                      : ''}
                    {a.rejected_reason ? ` · ${a.rejected_reason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px] capitalize">{a.status}</Badge>
                  {(a.status === 'scored' || a.status === 'ready') && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewAsset.mutate({ id: a.id, status: 'approved' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reviewAsset.mutate({ id: a.id, status: 'rejected' })}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        <p className="text-sm font-medium">Image briefs</p>
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
                    Approve brief
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
