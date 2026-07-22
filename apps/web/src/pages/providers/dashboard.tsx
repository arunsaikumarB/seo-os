import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plug,
  HeartPulse,
  ScrollText,
  Activity,
  KeyRound,
  FlaskConical,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

type ProviderRow = {
  key: string;
  displayName: string;
  type: string;
  enabled: boolean;
  isDefault: boolean;
  isPreferred?: boolean;
  isEstimated: boolean;
  costTier: string;
  capabilities: string[];
  featureEnabled: boolean;
};

type HealthSnap = {
  connected: number;
  healthy: number;
  offline: number;
  warning: number;
  todaysCalls: number;
  errors: number;
  failoverEvents: number;
  averageLatencyMs: number | null;
  providers: Array<{ key: string; status: string; message: string; latencyMs?: number }>;
};

type Tab = 'dashboard' | 'configure' | 'health' | 'logs' | 'metrics' | 'credentials' | 'testing';

export function ProviderDashboardPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [secret, setSecret] = useState('');
  const [endpoint, setEndpoint] = useState('');

  const providers = useQuery({
    queryKey: ['pif-providers', projectId, typeFilter],
    queryFn: () =>
      request<{ data: ProviderRow[] }>(
        `/v1/projects/${projectId}/providers${typeFilter ? `?type=${typeFilter}` : ''}`
      ),
    enabled: !!projectId,
  });

  const health = useQuery({
    queryKey: ['pif-health', projectId],
    queryFn: () =>
      request<{ data: HealthSnap }>(`/v1/projects/${projectId}/providers/health`),
    enabled: !!projectId,
  });

  const logs = useQuery({
    queryKey: ['pif-logs', projectId],
    queryFn: () =>
      request<{ data: Array<{ id: string; provider_key: string; action: string; message: string; created_at: string; success?: boolean }> }>(
        `/v1/projects/${projectId}/providers/logs`
      ),
    enabled: !!projectId && (tab === 'logs' || tab === 'dashboard'),
  });

  const stats = useQuery({
    queryKey: ['pif-stats', projectId],
    queryFn: () =>
      request<{ data: { usage: Array<Record<string, unknown>>; failovers: Array<Record<string, unknown>> } }>(
        `/v1/projects/${projectId}/providers/statistics`
      ),
    enabled: !!projectId && tab === 'metrics',
  });

  const types = useMemo(() => {
    const set = new Set((providers.data?.data ?? []).map((p) => p.type));
    return [...set].sort();
  }, [providers.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pif-providers', projectId] });
    qc.invalidateQueries({ queryKey: ['pif-health', projectId] });
    qc.invalidateQueries({ queryKey: ['pif-logs', projectId] });
    qc.invalidateQueries({ queryKey: ['mission-control-summary', projectId] });
  };

  const connect = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/providers/connect`, {
        method: 'POST',
        body: JSON.stringify({
          providerKey: selectedKey,
          secret: secret || undefined,
          endpoint: endpoint || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Provider connected');
      setSecret('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ key, enable }: { key: string; enable: boolean }) =>
      request(`/v1/projects/${projectId}/providers/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        body: JSON.stringify({ providerKey: key }),
      }),
    onSuccess: () => {
      toast.success('Updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (key: string) =>
      request(`/v1/projects/${projectId}/providers/test`, {
        method: 'POST',
        body: JSON.stringify({ providerKey: key }),
      }),
    onSuccess: () => {
      toast.success('Health test completed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const failover = useMutation({
    mutationFn: (fromProviderKey: string) =>
      request(`/v1/projects/${projectId}/providers/failover`, {
        method: 'POST',
        body: JSON.stringify({ fromProviderKey, reason: 'admin_ui' }),
      }),
    onSuccess: () => {
      toast.success('Failover recorded');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectPreferred = useMutation({
    mutationFn: (providerKey: string) =>
      request(`/v1/projects/${projectId}/providers/select`, {
        method: 'POST',
        body: JSON.stringify({ providerKey }),
      }),
    onSuccess: (_data, providerKey) => {
      setSelectedKey(providerKey);
      toast.success(`Selected ${providerKey} as default`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshWorkers = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/providers/workers/refresh`, { method: 'POST' }),
    onSuccess: () => toast.success('Health workers queued'),
    onError: (e: Error) => toast.error(e.message),
  });

  const h = health.data?.data;
  const rows = providers.data?.data ?? [];
  const tabs: { id: Tab; label: string; icon: typeof Plug }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Plug },
    { id: 'configure', label: 'Configuration', icon: KeyRound },
    { id: 'health', label: 'Health', icon: HeartPulse },
    { id: 'logs', label: 'Logs', icon: ScrollText },
    { id: 'metrics', label: 'Metrics', icon: Activity },
    { id: 'credentials', label: 'Credentials', icon: KeyRound },
    { id: 'testing', label: 'Testing', icon: FlaskConical },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Plug className="h-6 w-6" /> Provider Integration
          </h1>
          <p className="text-muted-foreground">
            Hot-swappable providers with health, failover, and encrypted credentials — no vendor lock-in.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshWorkers.isPending}
          onClick={() => refreshWorkers.mutate()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh health
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? 'default' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              <Icon className="h-3.5 w-3.5 mr-1" />
              {t.label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['Connected', h?.connected],
            ['Healthy', h?.healthy],
            ["Today's calls", h?.todaysCalls],
            ['Failovers', h?.failoverEvents],
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

      {(tab === 'dashboard' || tab === 'configure' || tab === 'testing') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Providers</CardTitle>
            <CardDescription>Filter by type — defaults remain Estimated / FLUX / Playwright / SMTP / Gemini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {providers.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              rows.slice(0, tab === 'dashboard' ? 12 : 80).map((p) => (
                <div
                  key={p.key}
                  className="rounded-md border p-3 flex flex-wrap justify-between gap-2 items-center"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {p.displayName}{' '}
                      {(p.isPreferred || p.isDefault) && (
                        <Badge className="text-[10px] ml-1">selected</Badge>
                      )}
                      {p.isEstimated && <Badge className="text-[10px] ml-1">estimated</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.key} · {p.type} · {p.costTier}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="text-[10px]">{p.enabled ? 'enabled' : 'disabled'}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate({ key: p.key, enable: !p.enabled })}
                    >
                      {p.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    {(tab === 'testing' || tab === 'configure') && (
                      <Button size="sm" variant="outline" onClick={() => test.mutate(p.key)}>
                        Test
                      </Button>
                    )}
                    {tab === 'testing' && !p.isEstimated && (
                      <Button size="sm" variant="ghost" onClick={() => failover.mutate(p.key)}>
                        Failover
                      </Button>
                    )}
                    {tab === 'configure' && (
                      <Button
                        size="sm"
                        variant={p.isPreferred ? 'default' : 'ghost'}
                        disabled={selectPreferred.isPending}
                        onClick={() => selectPreferred.mutate(p.key)}
                      >
                        {p.isPreferred ? 'Selected' : 'Select'}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {(tab === 'configure' || tab === 'credentials') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect / credentials</CardTitle>
            <CardDescription>Secrets are encrypted at rest (AES-256-GCM). Never returned to the client.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-lg">
            <div className="space-y-1">
              <Label>Provider key</Label>
              <Input
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                placeholder="keyword.dataforseo"
              />
            </div>
            <div className="space-y-1">
              <Label>API key / secret</Label>
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1">
              <Label>Endpoint (optional)</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://" />
            </div>
            <Button disabled={!selectedKey || connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? 'Saving…' : 'Connect & enable'}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'health' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider health</CardTitle>
            <CardDescription>
              Avg latency {h?.averageLatencyMs ?? '—'} ms · Offline {h?.offline ?? 0} · Errors{' '}
              {h?.errors ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(h?.providers ?? []).map((p) => (
              <div key={p.key} className="flex justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.key}</p>
                  <p className="text-xs text-muted-foreground">{p.message}</p>
                </div>
                <Badge className="text-[10px] capitalize">{p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(logs.data?.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider logs yet.</p>
            ) : (
              (logs.data?.data ?? []).map((l) => (
                <div key={l.id} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {l.provider_key} · {l.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{l.message}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'metrics' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage & failover metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {(stats.data?.data.usage ?? []).length} usage row(s) ·{' '}
              {(stats.data?.data.failovers ?? []).length} failover event(s)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                request(`/v1/projects/${projectId}/providers/reports?format=csv`).then(() =>
                  toast.success('Open reports via API: GET /providers/reports?format=csv')
                )
              }
            >
              Export report (CSV)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
