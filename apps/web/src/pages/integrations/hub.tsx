import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plug,
  RefreshCw,
  Unplug,
  HeartPulse,
  KeyRound,
  History,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { useAppStore } from '@/stores/app-store';

type CatalogEntry = {
  key: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  scopes: string[];
  capabilities: Array<{ id: string; label: string }>;
};

type Connection = {
  id: string;
  provider_key: string;
  display_name: string;
  status: string;
  health_status: string;
  health_message?: string | null;
  last_sync_at?: string | null;
  error_message?: string | null;
  scopes?: string[];
  external_account_label?: string | null;
};

type SyncJob = {
  id: string;
  connection_id: string;
  status: string;
  mode: string;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
};

export function IntegrationsHubPage({ projectIdOverride }: { projectIdOverride?: string } = {}) {
  const params = useParams();
  const storeProjectId = useAppStore((s) => s.currentProjectId);
  const projectId = projectIdOverride || params.projectId || storeProjectId || '';
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Connection | null>(null);

  const summary = useQuery({
    queryKey: ['integrations-summary', projectId],
    queryFn: () =>
      request<{
        data: {
          connectedCount: number;
          availableCount: number;
          syncQueue: number;
          failedSyncs: number;
          lastSyncAt: string | null;
          apiHealth: { status: string };
          providers: CatalogEntry[];
        };
      }>(`/v1/projects/${projectId}/integrations/summary`),
    enabled: !!projectId,
  });

  const connections = useQuery({
    queryKey: ['integrations-connections', projectId],
    queryFn: () =>
      request<{ data: Connection[] }>(`/v1/projects/${projectId}/integrations/connections`),
    enabled: !!projectId,
  });

  const syncJobs = useQuery({
    queryKey: ['integrations-sync', projectId],
    queryFn: () =>
      request<{ data: SyncJob[] }>(`/v1/projects/${projectId}/integrations/sync-jobs`),
    enabled: !!projectId,
  });

  const usage = useQuery({
    queryKey: ['integrations-usage', projectId],
    queryFn: () =>
      request<{ data: Array<{ metric_key: string; metric_value: number; period_start: string }> }>(
        `/v1/projects/${projectId}/integrations/usage`
      ),
    enabled: !!projectId,
  });

  const connect = useMutation({
    mutationFn: (providerKey: string) =>
      request(`/v1/projects/${projectId}/integrations/connections`, {
        method: 'POST',
        body: JSON.stringify({
          providerKey,
          credentials: { oauthCode: 'hub-connect', label: providerKey },
        }),
      }),
    onSuccess: () => {
      toast.success('Provider connected');
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Connect failed')),
  });

  const disconnect = useMutation({
    mutationFn: (connectionId: string) =>
      request(`/v1/projects/${projectId}/integrations/connections/${connectionId}/disconnect`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      toast.success('Disconnected');
      setSelected(null);
      invalidate();
    },
  });

  const sync = useMutation({
    mutationFn: (connectionId: string) =>
      request(`/v1/projects/${projectId}/integrations/connections/${connectionId}/sync`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'manual' }),
      }),
    onSuccess: () => {
      toast.success('Sync queued');
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Sync failed')),
  });

  const health = useMutation({
    mutationFn: (connectionId: string) =>
      request(`/v1/projects/${projectId}/integrations/connections/${connectionId}/health`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      toast.success('Health check complete');
      invalidate();
    },
  });

  const refresh = useMutation({
    mutationFn: (connectionId: string) =>
      request(`/v1/projects/${projectId}/integrations/connections/${connectionId}/refresh`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => toast.success('Token refreshed'),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['integrations-summary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['integrations-connections', projectId] });
    queryClient.invalidateQueries({ queryKey: ['integrations-sync', projectId] });
    queryClient.invalidateQueries({ queryKey: ['integrations-usage', projectId] });
  }

  const data = summary.data?.data;
  const connectedKeys = useMemo(
    () => new Set((connections.data?.data ?? []).filter((c) => c.status === 'connected').map((c) => c.provider_key)),
    [connections.data]
  );

  if (!projectId) {
    return (
      <PageTransition className="space-y-4">
        <h1 className="text-2xl font-semibold">Integration Hub</h1>
        <p className="text-muted-foreground text-sm">
          Select a project first, then open Integrations from the project sidebar — or{' '}
          <Link className="underline" to="/projects">
            go to projects
          </Link>
          .
        </p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Plug className="h-6 w-6" /> Integration Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modular providers — connect, sync, monitor, and replace without changing the core platform
        </p>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : data ? (
        <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerItem>
            <Metric label="Connected" value={data.connectedCount} />
          </StaggerItem>
          <StaggerItem>
            <Metric label="Available" value={data.availableCount} />
          </StaggerItem>
          <StaggerItem>
            <Metric label="Sync queue" value={data.syncQueue} />
          </StaggerItem>
          <StaggerItem>
            <Metric label="Failed syncs" value={data.failedSyncs} />
          </StaggerItem>
        </StaggerGrid>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Connected providers</CardTitle>
            <CardDescription>Status · last sync · health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(connections.data?.data ?? [])
              .filter((c) => c.status === 'connected')
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/40"
                  onClick={() => setSelected(c)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.external_account_label ?? c.provider_key}
                        {c.last_sync_at
                          ? ` · synced ${new Date(c.last_sync_at).toLocaleString()}`
                          : ' · never synced'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Badge className="text-[10px]">{c.status}</Badge>
                      <Badge className="text-[10px]">{c.health_status}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            {(connections.data?.data ?? []).filter((c) => c.status === 'connected').length === 0 && (
              <p className="text-sm text-muted-foreground">No connections yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Available providers</CardTitle>
            <CardDescription>GSC · GA4 · Email · WordPress · Slack</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-auto">
            {(data?.providers ?? []).map((p) => (
              <div key={p.key} className="rounded-lg border p-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {p.category} · {p.authType} · {p.capabilities.length} capabilities
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={
                    connectedKeys.has(p.key) ||
                    connect.isPending
                  }
                  onClick={async () => {
                    if (p.key === 'gmail' || p.key === 'outlook') {
                      try {
                        const provider = p.key === 'gmail' ? 'google' : 'microsoft';
                        const res = await request<{ data: { url: string } }>(
                          `/v1/projects/${projectId}/integrations/oauth/${provider}/start`
                        );
                        window.location.href = res.data.url;
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : 'OAuth credentials required (configure env)'
                        );
                      }
                      return;
                    }
                    connect.mutate(p.key);
                  }}
                >
                  {connectedKeys.has(p.key)
                    ? 'Connected'
                    : p.key === 'gmail' || p.key === 'outlook'
                      ? 'Connect OAuth'
                      : 'Connect'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Sync history
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-auto">
            {(syncJobs.data?.data ?? []).map((j) => (
              <div key={j.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                <div>
                  <p className="font-mono text-xs">{j.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.mode} · {new Date(j.created_at).toLocaleString()}
                    {j.error ? ` · ${j.error}` : ''}
                  </p>
                </div>
                <Badge>{j.status}</Badge>
              </div>
            ))}
            {(syncJobs.data?.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No sync jobs yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(usage.data?.data ?? []).slice(0, 8).map((u, i) => (
              <div key={`${u.metric_key}-${i}`} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{u.metric_key}</span>
                <span className="font-medium">{u.metric_value}</span>
              </div>
            ))}
            {(usage.data?.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Usage appears after sync.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Connection detail
          </CardTitle>
          <CardDescription>Permissions · actions · errors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!selected ? (
            <p className="text-muted-foreground">Select a connected provider.</p>
          ) : (
            <>
              <p className="font-medium">{selected.display_name}</p>
              <p className="text-muted-foreground">
                Health: {selected.health_message ?? selected.health_status}
                {selected.error_message ? ` · Error: ${selected.error_message}` : ''}
              </p>
              <p className="text-xs">Scopes: {(selected.scopes ?? []).join(', ') || '—'}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => sync.mutate(selected.id)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Sync
                </Button>
                <Button size="sm" variant="outline" onClick={() => health.mutate(selected.id)}>
                  <HeartPulse className="h-3 w-3 mr-1" /> Health
                </Button>
                <Button size="sm" variant="outline" onClick={() => refresh.mutate(selected.id)}>
                  <KeyRound className="h-3 w-3 mr-1" /> Refresh token
                </Button>
                <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(selected.id)}>
                  <Unplug className="h-3 w-3 mr-1" /> Disconnect
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
