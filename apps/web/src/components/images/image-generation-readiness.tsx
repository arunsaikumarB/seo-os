import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  reason: string;
  fixLabel?: string;
  fixHref?: string;
};

export type ImageReadiness = {
  imageGenerationReady: boolean;
  overallStatus: 'READY' | 'NOT READY';
  readinessScore: number;
  checks: ReadinessCheck[];
  primaryBlocker: ReadinessCheck | null;
  providers: Array<{
    key: string;
    displayName: string;
    flagEnabled: boolean;
    configured: boolean;
    healthy: boolean;
    draftMode?: boolean;
    health: { status: string; message?: string; latencyMs?: number };
  }>;
  defaultProviderKey: string | null;
  briefId: string | null;
  activeJobs: number;
  generationStatus: string;
};

export function useImageGenerationReadiness(projectId: string, opportunityId?: string | null) {
  const { request } = useApi();
  const qs = opportunityId ? `?opportunityId=${encodeURIComponent(opportunityId)}` : '';
  return useQuery({
    queryKey: ['image-readiness', projectId, opportunityId ?? 'none'],
    queryFn: () =>
      request<{ data: ImageReadiness }>(`/v1/projects/${projectId}/images/readiness${qs}`),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });
}

function resolveHref(projectId: string, href?: string) {
  if (!href) return null;
  if (href.startsWith('http') || href.startsWith('/')) return href;
  return `/projects/${projectId}/${href}`;
}

export function ImageGenerationReadinessPanel({
  projectId,
  opportunityId,
  compact = false,
}: {
  projectId: string;
  opportunityId?: string | null;
  compact?: boolean;
}) {
  const { projectId: routeProjectId = '' } = useParams();
  const pid = projectId || routeProjectId;
  const readiness = useImageGenerationReadiness(pid, opportunityId);
  const data = readiness.data?.data;

  if (readiness.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load image generation readiness.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Image Generation Status</p>
          <p className="text-xs text-muted-foreground">
            Score {data.readinessScore}% ·{' '}
            {data.defaultProviderKey
              ? `Provider ${data.defaultProviderKey}`
              : 'No default provider'}
            {data.activeJobs > 0 ? ` · ${data.activeJobs} active job(s)` : ''}
          </p>
        </div>
        <Badge
          className={
            data.imageGenerationReady
              ? 'bg-emerald-500/15 text-emerald-700'
              : 'bg-amber-500/15 text-amber-700'
          }
        >
          {data.overallStatus}
        </Badge>
      </div>

      <ul className={`space-y-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
        {data.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className={c.ok ? 'font-medium' : 'font-medium text-muted-foreground'}>
                {c.label}
              </p>
              {!c.ok && <p className="text-xs text-muted-foreground">{c.reason}</p>}
            </div>
          </li>
        ))}
      </ul>

      {!data.imageGenerationReady && data.primaryBlocker && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {data.primaryBlocker.reason}
          </p>
          <p className="text-xs text-muted-foreground">
            Fix: {data.primaryBlocker.fixLabel ?? 'Resolve the blockers above'}
          </p>
          {data.primaryBlocker.fixHref && (
            <Button size="sm" variant="outline" asChild>
              <Link to={resolveHref(pid, data.primaryBlocker.fixHref) ?? '#'}>
                {data.primaryBlocker.fixLabel ?? 'Open settings'}
              </Link>
            </Button>
          )}
          {data.primaryBlocker.key === 'provider_configured' && (
            <p className="text-xs text-muted-foreground">
              Configure one in Settings → Provider Integrations → Image Providers
            </p>
          )}
        </div>
      )}

      {data.imageGenerationReady && (
        <p className="text-sm text-emerald-700 font-medium">Image Provider Ready</p>
      )}
    </div>
  );
}
