import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  Filter,
  ListChecks,
  Play,
  RefreshCw,
  ShieldAlert,
  Skull,
  FileWarning,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { PageTransition } from '@/components/demo/page-transition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ProbeBand = 'ready' | 'check' | 'blocked' | 'dead' | 'no_form' | 'unprobed';

type LinkProbeResult = {
  band: ProbeBand;
  score: number;
  alive: boolean;
  formFound: boolean;
  formUrl: string | null;
  fieldCount: number;
  multiStep: boolean;
  gates: string[];
  reasons: string[];
  probedAt: string;
  listingPricing?: 'free' | 'paid' | 'unknown';
};

type QueueItem = {
  opportunityId: string;
  domain: string;
  title: string;
  url: string;
  lifecycle: string | null;
  probe: LinkProbeResult;
};

type Stats = {
  total: number;
  probed: number;
  unprobed: number;
  ready: number;
  check: number;
  blocked: number;
  dead: number;
  no_form: number;
  lastRunAt: string | null;
};

const BANDS: Array<{ id: ProbeBand | 'all'; label: string; tone: string }> = [
  { id: 'all', label: 'All probed', tone: 'bg-muted' },
  { id: 'ready', label: 'Ready', tone: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30' },
  { id: 'check', label: 'Check', tone: 'bg-amber-500/15 text-amber-900 border-amber-500/30' },
  { id: 'blocked', label: 'Blocked', tone: 'bg-orange-500/15 text-orange-900 border-orange-500/30' },
  { id: 'no_form', label: 'No form', tone: 'bg-slate-500/15 text-slate-800 border-slate-500/30' },
  { id: 'dead', label: 'Dead', tone: 'bg-red-500/15 text-red-800 border-red-500/30' },
];

function FunnelCard({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-3 text-left transition hover:bg-muted/40',
        active && 'ring-2 ring-emerald-500/50 border-emerald-500/40'
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </button>
  );
}

export function RankedSubmitQueuePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [band, setBand] = useState<ProbeBand | 'all'>('ready');
  const [pricingFilter, setPricingFilter] = useState<'free' | 'paid' | 'all'>('free');

  const statsQ = useQuery({
    queryKey: ['link-probe-stats', projectId],
    queryFn: () =>
      request<{ data: Stats }>(`/v1/projects/${projectId}/backlink-builder/link-probe/stats`),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  const queueQ = useQuery({
    queryKey: ['link-probe-queue', projectId, band],
    queryFn: () =>
      request<{ data: { stats: Stats; items: QueueItem[] } }>(
        `/v1/projects/${projectId}/backlink-builder/link-probe/queue?band=${band}&limit=150`
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  const runProbe = useMutation({
    mutationFn: (opts: { limit?: number; force?: boolean; sync?: boolean }) =>
      request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/backlink-builder/link-probe/run`,
        {
          method: 'POST',
          body: JSON.stringify(opts),
        }
      ),
    onSuccess: (res) => {
      const mode = String(res.data?.mode ?? '');
      if (mode === 'sync') {
        toast.success(
          `Probed ${res.data.processed ?? 0} links · skipped fresh ${res.data.skippedFresh ?? 0}`
        );
      } else {
        toast.success(String(res.data?.message ?? 'Link probe queued'));
      }
      void qc.invalidateQueries({ queryKey: ['link-probe-stats', projectId] });
      void qc.invalidateQueries({ queryKey: ['link-probe-queue', projectId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Probe failed')),
  });

  const stats = statsQ.data?.data ?? queueQ.data?.data.stats;
  const rawItems = queueQ.data?.data.items ?? [];
  const items = useMemo(() => {
    if (pricingFilter === 'all') return rawItems;
    return rawItems.filter((it) => {
      const p = it.probe.listingPricing ?? 'unknown';
      if (pricingFilter === 'free') return p === 'free' || p === 'unknown';
      return p === 'paid';
    });
  }, [rawItems, pricingFilter]);

  const funnelHint = useMemo(() => {
    if (!stats) return 'Run a probe to rank your imported websites.';
    if (stats.unprobed > 0) {
      return `${stats.unprobed} not probed yet — run probe in batches of ~80.`;
    }
    return `Last probe ${stats.lastRunAt ? new Date(stats.lastRunAt).toLocaleString() : '—'}`;
  }, [stats]);

  return (
    <PageTransition>
      <div className="space-y-6 p-6 max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ListChecks className="h-6 w-6" /> Ranked Submit Queue
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              Rank imported sites by form readiness. Default filter is Free only — form/payment
              must include the word “free”. Paid listings are set aside.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={runProbe.isPending}
              onClick={() => runProbe.mutate({ limit: 15, sync: true, force: false })}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Probe 15 now
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={runProbe.isPending}
              onClick={() => runProbe.mutate({ limit: 80, force: false })}
            >
              Queue batch (80)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={runProbe.isPending}
              onClick={() => {
                void statsQ.refetch();
                void queueQ.refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funnel</CardTitle>
            <CardDescription>{funnelHint}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <FunnelCard
              label="Imported"
              value={stats?.total ?? 0}
              hint="Active opportunities"
            />
            <FunnelCard
              label="Ready"
              value={stats?.ready ?? 0}
              hint="Submit these"
              active={band === 'ready'}
              onClick={() => setBand('ready')}
            />
            <FunnelCard
              label="Check"
              value={stats?.check ?? 0}
              hint="Multi-step / weak fields"
              active={band === 'check'}
              onClick={() => setBand('check')}
            />
            <FunnelCard
              label="Blocked"
              value={stats?.blocked ?? 0}
              hint="CAPTCHA / login"
              active={band === 'blocked'}
              onClick={() => setBand('blocked')}
            />
            <FunnelCard
              label="No form"
              value={stats?.no_form ?? 0}
              hint="Nothing to fill"
              active={band === 'no_form'}
              onClick={() => setBand('no_form')}
            />
            <FunnelCard
              label="Dead"
              value={stats?.dead ?? 0}
              hint="Unreachable"
              active={band === 'dead'}
              onClick={() => setBand('dead')}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {BANDS.map((b) => (
            <Button
              key={b.id}
              size="sm"
              variant={band === b.id ? 'default' : 'outline'}
              className="h-8"
              onClick={() => setBand(b.id)}
            >
              {b.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground mx-1">·</span>
          {(
            [
              { id: 'free' as const, label: 'Free only' },
              { id: 'paid' as const, label: 'Paid aside' },
              { id: 'all' as const, label: 'All pricing' },
            ] as const
          ).map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={pricingFilter === p.id ? 'secondary' : 'outline'}
              className="h-8"
              onClick={() => setPricingFilter(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            Unprobed: {stats?.unprobed ?? 0}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {band === 'all' ? 'All probed' : BANDS.find((b) => b.id === band)?.label} (
              {items.length})
            </CardTitle>
            <CardDescription>
              {band === 'ready'
                ? 'Open Assisted Manual for these domains after content is generated.'
                : 'Sorted by probe score. Probe never submits forms.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queueQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {stats?.unprobed ? (
                  <>
                    No items in this band yet. Click <strong>Probe 15 now</strong> to classify the
                    first batch.
                  </>
                ) : (
                  <>Nothing in this band. Try another filter or re-run with force.</>
                )}
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.opportunityId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{item.domain || item.title}</span>
                      <Badge
                        className={cn(
                          'text-[10px]',
                          BANDS.find((b) => b.id === item.probe.band)?.tone
                        )}
                      >
                        {item.probe.band} · {item.probe.score}
                      </Badge>
                      {item.probe.listingPricing ? (
                        <Badge
                          className={cn(
                            'text-[10px]',
                            item.probe.listingPricing === 'free' &&
                              'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
                            item.probe.listingPricing === 'paid' &&
                              'bg-slate-500/15 text-slate-800 border-slate-500/30',
                            item.probe.listingPricing === 'unknown' &&
                              'bg-muted text-muted-foreground'
                          )}
                        >
                          {item.probe.listingPricing === 'free'
                            ? 'Free'
                            : item.probe.listingPricing === 'paid'
                              ? 'Paid'
                              : 'Pricing ?'}
                        </Badge>
                      ) : null}
                      {item.probe.multiStep ? (
                        <Badge className="text-[10px] border-amber-500/40">Multi-step</Badge>
                      ) : null}
                      {item.probe.gates?.length ? (
                        <Badge className="text-[10px] border-orange-500/40">
                          <ShieldAlert className="h-3 w-3 mr-0.5 inline" />
                          {item.probe.gates.join(', ')}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.probe.reasons?.join(' · ') || item.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.probe.formUrl || item.url ? (
                      <Button size="sm" variant="ghost" className="h-8" asChild>
                        <a
                          href={item.probe.formUrl || item.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : null}
                    {item.probe.band === 'ready' || item.probe.band === 'check' ? (
                      <Button size="sm" className="h-8" asChild>
                        <Link to={`/projects/${projectId}/backlink-builder/assisted-manual`}>
                          Assisted Manual
                        </Link>
                      </Button>
                    ) : item.probe.band === 'dead' ? (
                      <Skull className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileWarning className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
