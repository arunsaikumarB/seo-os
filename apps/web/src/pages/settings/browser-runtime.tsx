import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MonitorSmartphone, RefreshCw, Wrench, Download, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

type RuntimeStatus = {
  playwright_installed: boolean;
  chromium_exists: boolean;
  executable_exists: boolean;
  launch_ok: boolean;
  browser_version: string | null;
  executable_path: string | null;
  playwright_version: string | null;
  cache_size_bytes: number | null;
  installed_browsers: string[];
  install_status: string;
  health: string;
  last_error: string | null;
  last_verification_at: string | null;
  install_progress?: Record<string, unknown>;
};

type DiagResult = {
  result: 'PASS' | 'FAIL';
  steps: Array<{ name: string; ok: boolean; detail: string; ms: number }>;
  reason?: string;
};

function formatBytes(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function healthBadge(health: string) {
  if (health === 'healthy') return 'bg-emerald-500/15 text-emerald-700';
  if (health === 'installing') return 'bg-amber-500/15 text-amber-700';
  if (health === 'degraded') return 'bg-amber-500/15 text-amber-700';
  return 'bg-red-500/15 text-red-700';
}

export function BrowserRuntimePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();

  const runtime = useQuery({
    queryKey: ['browser-runtime', projectId],
    queryFn: () =>
      request<{ data: RuntimeStatus }>(`/v1/projects/${projectId}/browser/runtime`),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['browser-runtime', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-health', projectId] });
    qc.invalidateQueries({ queryKey: ['mission-control-summary'] });
  };

  const verify = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/runtime/verify`, {
        method: 'POST',
        body: JSON.stringify({ autoInstall: true }),
      }),
    onSuccess: () => {
      toast.success('Browser runtime verified');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const install = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/runtime/install`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Chromium install finished — waiting jobs will resume if healthy');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const repair = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/runtime/repair`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Browser repair completed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diagnostics = useMutation({
    mutationFn: () =>
      request<{ data: DiagResult }>(`/v1/projects/${projectId}/browser/runtime/diagnostics`, {
        method: 'POST',
      }),
    onSuccess: (res) => {
      const r = res.data;
      if (r.result === 'PASS') toast.success('Diagnostics PASS');
      else toast.error(r.reason || 'Diagnostics FAIL');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = runtime.data?.data;
  const diag = diagnostics.data?.data;
  const busy =
    verify.isPending || install.isPending || repair.isPending || diagnostics.isPending;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MonitorSmartphone className="h-6 w-6" />
            Browser Runtime
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Playwright / Chromium health for Browser Execution. Start stays disabled until Healthy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => verify.mutate()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Verify
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => install.mutate()}>
            <Download className="h-3.5 w-3.5 mr-1" /> Reinstall Browser
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => repair.mutate()}>
            <Wrench className="h-3.5 w-3.5 mr-1" /> Repair Browser
          </Button>
          <Button size="sm" disabled={busy} onClick={() => diagnostics.mutate()}>
            <Stethoscope className="h-3.5 w-3.5 mr-1" /> Run Diagnostics
          </Button>
        </div>
      </div>

      {runtime.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Runtime Status</CardTitle>
              <Badge className={healthBadge(s?.health ?? 'missing')}>
                {s?.health === 'healthy' ? 'Healthy' : s?.health === 'installing' ? 'Installing' : 'Missing'}
              </Badge>
            </div>
            <CardDescription>
              Last verification:{' '}
              {s?.last_verification_at
                ? new Date(s.last_verification_at).toLocaleString()
                : 'Never'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Playwright Version</p>
              <p className="font-medium">{s?.playwright_version ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chromium Version</p>
              <p className="font-medium">{s?.browser_version ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Executable Path</p>
              <p className="font-medium break-all text-xs">{s?.executable_path ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cache Size</p>
              <p className="font-medium">{formatBytes(s?.cache_size_bytes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Install Status</p>
              <p className="font-medium capitalize">{s?.install_status ?? 'unknown'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Installed Browsers</p>
              <p className="font-medium">
                {(s?.installed_browsers?.length ? s.installed_browsers : ['—']).join(', ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Launch Probe</p>
              <p className="font-medium">{s?.launch_ok ? 'OK' : 'Failed'}</p>
            </div>
            {s?.last_error ? (
              <div className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {s.last_error}
              </div>
            ) : null}
            {s?.health !== 'healthy' ? (
              <div className="sm:col-span-2 rounded-md border px-3 py-2 text-xs">
                <p className="font-medium">Browser Runtime Missing</p>
                <p className="text-muted-foreground mt-0.5">
                  Administrator Action Required — Suggested Fix: Install Chromium (Reinstall Browser).
                  Jobs waiting for infrastructure resume automatically after success.
                </p>
                <Link
                  className="text-primary underline mt-1 inline-block"
                  to={`/projects/${projectId}/backlink-builder/execution`}
                >
                  Open Execution Center
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {diag ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Diagnostics — {diag.result === 'PASS' ? 'PASS' : 'FAIL'}
            </CardTitle>
            <CardDescription>
              Launch Chromium · Open Google · Navigate · Close Browser
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {diag.steps.map((step, i) => (
              <div
                key={`${step.name}-${i}`}
                className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{step.name}</p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
                <Badge className={step.ok ? 'bg-emerald-500/15 text-emerald-700' : 'bg-red-500/15 text-red-700'}>
                  {step.ok ? 'PASS' : 'FAIL'}
                </Badge>
              </div>
            ))}
            {diag.reason ? (
              <p className="text-xs text-red-700">{diag.reason}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
