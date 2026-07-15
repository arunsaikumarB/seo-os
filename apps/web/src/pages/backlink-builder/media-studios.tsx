import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
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
  const { opportunity: selectedOpp, setOpportunity } = useCurrentOpportunity(projectId);
  const [imageType, setImageType] = useState('blog_hero');
  const autoBriefRef = useRef<string | null>(null);

  const readiness = useImageGenerationReadiness(projectId, selectedOpp?.id);
  const ready = readiness.data?.data;

  // When selection changes, refresh readiness + related resources immediately (no page reload)
  useEffect(() => {
    if (!selectedOpp?.id) return;
    void qc.invalidateQueries({ queryKey: ['image-readiness', projectId] });
    void qc.invalidateQueries({ queryKey: ['media-briefs', projectId, kind] });
    void qc.invalidateQueries({ queryKey: ['content-packs', projectId] });
    void qc.invalidateQueries({ queryKey: ['iie-images', projectId] });
    void qc.invalidateQueries({ queryKey: ['image-jobs', projectId] });
  }, [selectedOpp?.id, projectId, kind, qc]);

  const list = useQuery({
    queryKey: ['media-briefs', projectId, kind],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          opportunity_id?: string;
          review_status: string;
          brief: { suggestions?: unknown[]; note?: string; generationStatus?: string };
          opportunities?: { title?: string; domain?: string };
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/media-briefs?kind=${kind}`),
    enabled: !!projectId,
    refetchInterval: selectedOpp ? 5_000 : false,
  });

  const contentPacks = useQuery({
    queryKey: ['content-packs', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          opportunity_id?: string;
          status?: string;
          pack_type?: string;
          pack?: Record<string, unknown>;
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/content-packs`),
    enabled: !!projectId && !!selectedOpp,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media-briefs', projectId, kind] });
      qc.invalidateQueries({ queryKey: ['image-readiness', projectId] });
    },
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
    if (b.opportunity_id && b.opportunity_id === selectedOpp.id) return true;
    const domain = b.opportunities?.domain?.toLowerCase();
    const title = b.opportunities?.title?.toLowerCase();
    return (
      domain === selectedOpp.domain?.toLowerCase() ||
      title === selectedOpp.website.toLowerCase() ||
      title === selectedOpp.title?.toLowerCase()
    );
  });

  const oppBrief = selectedOpp ? briefs[0] : null;
  const briefExists = Boolean(oppBrief);
  const relatedPack = useMemo(() => {
    if (!selectedOpp) return null;
    return (
      (contentPacks.data?.data ?? []).find((p) => p.opportunity_id === selectedOpp.id) ?? null
    );
  }, [contentPacks.data?.data, selectedOpp]);

  // Auto-queue image brief once when opportunity is active and no brief exists
  useEffect(() => {
    if (kind !== 'image') return;
    if (!selectedOpp?.id || list.isLoading || create.isPending) return;
    if (briefExists) {
      autoBriefRef.current = selectedOpp.id;
      return;
    }
    if (autoBriefRef.current === selectedOpp.id) return;
    autoBriefRef.current = selectedOpp.id;
    create.mutate();
  }, [kind, selectedOpp?.id, briefExists, list.isLoading, create.isPending]);

  const relatedAssets = useMemo(() => {
    const rows = assets.data?.data ?? [];
    if (!selectedOpp) return rows.slice(0, 12);
    return rows.filter((a) => a.opportunity_id === selectedOpp.id).slice(0, 12);
  }, [assets.data?.data, selectedOpp]);

  const recentJobs = (jobs.data?.data ?? []).slice(0, 8);
  const generateDisabledReason = !selectedOpp
    ? 'Select an approved website first'
    : !briefExists && !create.isPending
      ? 'Waiting for Image Brief — Generate Brief First'
      : create.isPending
        ? 'Generating image brief…'
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
            ? 'Uses the shared current opportunity — brief → generate asset → quality review → approve.'
            : 'Uses the shared current opportunity for video metadata briefs.'}
        </p>
      </div>

      <CurrentOpportunityBanner projectId={projectId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Current website</CardTitle>
          <CardDescription>
            Selection syncs across Content Studio, Browser Assistant, Submission Center, and
            Execution Center. Persists until you change it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={setOpportunity}
            mode="content"
            showTable={!selectedOpp}
            allowClear
            label={selectedOpp ? 'Change website' : 'Select approved website'}
          />
          {kind === 'image' && selectedOpp && (
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
        </CardContent>
      </Card>

      {selectedOpp && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Loaded context</CardTitle>
            <CardDescription>
              Project metadata, business details, content pack, and image requirements for{' '}
              {selectedOpp.website}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Website / Domain</p>
              <p className="font-medium">
                {selectedOpp.website}
                {selectedOpp.domain ? ` · ${selectedOpp.domain}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Backlink type</p>
              <p className="font-medium capitalize">
                {(selectedOpp.backlink_type ?? selectedOpp.opportunity_type).replace(/_/g, ' ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Business / scores</p>
              <p className="font-medium tabular-nums">
                DR {selectedOpp.domain_rating ?? '—'} · traffic{' '}
                {selectedOpp.monthly_traffic != null
                  ? selectedOpp.monthly_traffic.toLocaleString()
                  : '—'}{' '}
                · score {selectedOpp.score}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Content pack</p>
              <p className="font-medium">
                {contentPacks.isLoading
                  ? 'Loading…'
                  : relatedPack
                    ? `${relatedPack.pack_type ?? 'pack'} · ${relatedPack.status ?? 'ready'}`
                    : selectedOpp.has_content_pack
                      ? 'Linked'
                      : 'Not generated yet'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Image requirements</p>
              <p className="font-medium">
                {(selectedOpp.required_fields?.length ?? 0) > 0
                  ? selectedOpp.required_fields!.slice(0, 4).join(', ')
                  : 'Default image pack'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Image brief</p>
              <p className="font-medium">
                {list.isLoading
                  ? 'Checking…'
                  : briefExists
                    ? `${oppBrief?.review_status ?? 'ready'}`
                    : create.isPending
                      ? 'Generating…'
                      : 'Missing'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Readiness</p>
              <p className="font-medium">
                {readiness.isLoading
                  ? 'Checking…'
                  : ready?.imageGenerationReady
                    ? 'READY'
                    : ready?.overallStatus ?? 'NOT READY'}
              </p>
            </div>
          </CardContent>
          {kind === 'image' && !briefExists && (
            <CardContent className="pt-0">
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? 'Generating brief…' : 'Generate Image Brief'}
              </Button>
            </CardContent>
          )}
          {kind === 'video' && (
            <CardContent className="pt-0">
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? 'Queuing…' : `Generate Video Brief for ${selectedOpp.website}`}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {kind === 'image' && selectedOpp && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Image generation readiness</CardTitle>
            <CardDescription>
              Generate Image Asset enables automatically when every check passes — no page reload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {readiness.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ImageGenerationReadinessPanel
                projectId={projectId}
                opportunityId={selectedOpp.id}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!briefExists && (
                <Button variant="secondary" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? 'Generating brief…' : 'Generate Image Brief'}
                </Button>
              )}
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
            {ready?.imageGenerationReady && briefExists && (
              <p className="text-sm text-emerald-700 font-medium">
                Image Provider Ready — Generate Image Asset is enabled
              </p>
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
        <p className="text-sm font-medium">{kind === 'image' ? 'Image' : 'Video'} briefs</p>
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
                  <Button
                    size="sm"
                    onClick={() => review.mutate({ id: b.id, reviewStatus: 'approved' })}
                  >
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
              : `Select an approved website to load ${kind} briefs.`}
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
