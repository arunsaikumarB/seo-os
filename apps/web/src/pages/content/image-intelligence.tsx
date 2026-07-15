import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
import {
  ImageGenerationReadinessPanel,
  useImageGenerationReadiness,
} from '@/components/images/image-generation-readiness';

type ImageAsset = {
  id: string;
  image_type: string;
  status: string;
  provider_key: string;
  width?: number;
  height?: number;
  quality_scores?: { overall?: number; pass?: boolean };
  created_at: string;
};

const TYPES = [
  'blog_hero',
  'featured_image',
  'open_graph',
  'pinterest_pin',
  'directory_logo',
  'instagram_post',
  'guest_post_banner',
  'thumbnail',
];

export function ImageIntelligencePanel({ embedded = false }: { embedded?: boolean }) {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const { opportunity: selectedOpp, setOpportunity } = useCurrentOpportunity(projectId);
  const [imageType, setImageType] = useState('blog_hero');

  const meta = useQuery({
    queryKey: ['iie-images', projectId],
    queryFn: () =>
      request<{ data: ImageAsset[]; meta?: { generationEnabled?: boolean } }>(
        `/v1/projects/${projectId}/images`
      ),
    enabled: !!projectId,
  });

  const stats = useQuery({
    queryKey: ['iie-stats', projectId],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(`/v1/projects/${projectId}/images/statistics`),
    enabled: !!projectId,
  });

  const providers = useQuery({
    queryKey: ['iie-providers'],
    queryFn: () =>
      request<{ data: Array<{ key: string; displayName: string; configured: boolean }> }>(
        `/v1/projects/${projectId}/images/providers`
      ),
    enabled: !!projectId,
  });

  const readiness = useImageGenerationReadiness(projectId, selectedOpp?.id);
  const ready = readiness.data?.data;

  const generate = useMutation({
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved website first');
      if (!ready?.imageGenerationReady) {
        throw new Error(ready?.primaryBlocker?.reason ?? 'Image generation is not ready');
      }
      return request(`/v1/projects/${projectId}/images/generate`, {
        method: 'POST',
        body: JSON.stringify({
          imageType,
          opportunityId: selectedOpp.id,
          count: 1,
          providerKey: ready.defaultProviderKey ?? undefined,
        }),
      });
    },
    onSuccess: () => {
      toast.success(`Image generation queued for ${selectedOpp?.website ?? 'website'}`);
      qc.invalidateQueries({ queryKey: ['iie-images', projectId] });
      qc.invalidateQueries({ queryKey: ['iie-stats', projectId] });
      qc.invalidateQueries({ queryKey: ['image-jobs', projectId] });
      qc.invalidateQueries({ queryKey: ['image-readiness', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      request(`/v1/projects/${projectId}/images/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Review saved');
      qc.invalidateQueries({ queryKey: ['iie-images', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prepare = useMutation({
    mutationFn: (assetId: string) =>
      request(`/v1/projects/${projectId}/images/prepare-submission`, {
        method: 'POST',
        body: JSON.stringify({ assetId, siteKey: 'pinterest' }),
      }),
    onSuccess: () => toast.success('Submission package ready'),
    onError: (e: Error) => toast.error(e.message),
  });

  const assets = meta.data?.data ?? [];
  const s = stats.data?.data;

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ImageIcon className="h-6 w-6" /> Image Intelligence
          </h1>
          <p className="text-muted-foreground">
            Provider-based visual assets for backlink campaigns — FLUX / SDXL free path, quality-gated.
          </p>
        </div>
      )}

      <CurrentOpportunityBanner projectId={projectId} />

      <ImageGenerationReadinessPanel projectId={projectId} opportunityId={selectedOpp?.id} />

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['Generated', s?.generated],
            ['Approved', s?.approved],
            ['Submitted', s?.submitted],
            ['Rejected', s?.rejected],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{Number(value ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Generate
          </CardTitle>
          <CardDescription>Prompts are auto-built from domain style profile — no manual prompt required</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={setOpportunity}
            mode="content"
            showTable={false}
          />
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label>Image type</Label>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={imageType}
                onChange={(e) => setImageType(e.target.value)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={!ready?.imageGenerationReady || !selectedOpp || generate.isPending}
              title={
                !selectedOpp
                  ? 'Select an approved website first'
                  : !ready?.imageGenerationReady
                    ? ready?.primaryBlocker?.reason ?? 'Not ready'
                    : 'Generate Image Asset'
              }
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? 'Queuing…' : 'Generate Image Asset'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Image Studio</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/providers`}>Provider Settings</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(providers.data?.data ?? []).map((p) => (
            <Badge key={p.key} className="text-[10px]">
              {p.displayName}
              {p.configured ? ' · ready' : ' · unconfigured'}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {meta.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images yet.</p>
          ) : (
            assets.map((a) => (
              <div key={a.id} className="rounded-md border p-3 flex flex-wrap justify-between gap-2">
                <div>
                  <p className="text-sm font-medium capitalize">{a.image_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.provider_key} · {a.width}×{a.height} · score{' '}
                    {a.quality_scores?.overall ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px] capitalize">{a.status}</Badge>
                  {(a.status === 'scored' || a.status === 'ready') && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review.mutate({ id: a.id, status: 'approved' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => review.mutate({ id: a.id, status: 'rejected' })}
                      >
                        Reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => prepare.mutate(a.id)}>
                        Prep submit
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
