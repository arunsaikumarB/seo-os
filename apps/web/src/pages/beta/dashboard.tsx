import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Copy, Megaphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { getApiErrorMessage } from '@/lib/api';
import { NamedBarChart } from '@/components/analytics/charts';

export function BetaDashboardPage() {
  const orgId = useAppStore((s) => s.currentOrgId);
  const { request } = useApi();
  const qc = useQueryClient();
  const [inviteCode, setInviteCode] = useState('');
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');

  const dash = useQuery({
    queryKey: ['beta-dashboard', orgId],
    queryFn: () =>
      request<{
        data: {
          status: { betaMode: boolean; cohort: string | null; flags: Record<string, boolean> };
          activeUsers7d: number;
          dailyUsage: number;
          errors: number;
          crashRate: number;
          apiAvgMs: number;
          feedbackCount: number;
          openBugs: number;
          featureUsage: Array<{ name: string; value: number }>;
          recentFeedback: Array<{ id: string; title: string; type: string; severity: string }>;
          invitations: Array<{ id: string; code: string; status: string; email?: string }>;
          announcements: Array<{ id: string; title: string; body: string; severity: string }>;
        };
      }>(`/v1/organizations/${orgId}/beta/dashboard`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const enable = useMutation({
    mutationFn: () =>
      request(`/v1/organizations/${orgId}/beta/enable`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      toast.success('Closed Beta enabled for this organization');
      qc.invalidateQueries({ queryKey: ['beta-dashboard', orgId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Enable failed')),
  });

  const createInvite = useMutation({
    mutationFn: () =>
      request<{ data: { code: string } }>(`/v1/organizations/${orgId}/beta/invitations`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: (res) => {
      toast.success(`Invite created: ${res.data.code}`);
      setInviteCode(res.data.code);
      qc.invalidateQueries({ queryKey: ['beta-dashboard', orgId] });
    },
  });

  const acceptInvite = useMutation({
    mutationFn: () =>
      request(`/v1/organizations/${orgId}/beta/invitations/accept`, {
        method: 'POST',
        body: JSON.stringify({ code: inviteCode }),
      }),
    onSuccess: () => {
      toast.success('Invitation accepted');
      qc.invalidateQueries({ queryKey: ['beta-dashboard', orgId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Accept failed')),
  });

  const announce = useMutation({
    mutationFn: () =>
      request(`/v1/organizations/${orgId}/beta/announcements`, {
        method: 'POST',
        body: JSON.stringify({ title: announceTitle, body: announceBody, audience: 'beta' }),
      }),
    onSuccess: () => {
      toast.success('Announcement published');
      setAnnounceTitle('');
      setAnnounceBody('');
      qc.invalidateQueries({ queryKey: ['beta-dashboard', orgId] });
    },
  });

  const data = dash.data?.data;

  if (!orgId) {
    return (
      <PageTransition>
        <p className="text-sm text-muted-foreground">Select an organization.</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6" /> Closed Beta Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Invitation-only validation · usage · feedback · announcements
          </p>
        </div>
        <div className="flex gap-2">
          {data?.status.betaMode ? (
            <Badge className="border-emerald-500/30 text-emerald-600">Beta active</Badge>
          ) : (
            <Button onClick={() => enable.mutate()} disabled={enable.isPending}>
              Enable Beta Mode
            </Button>
          )}
        </div>
      </div>

      {data && (
        <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerItem>
            <Stat label="Active users (7d)" value={data.activeUsers7d} />
          </StaggerItem>
          <StaggerItem>
            <Stat label="Events (7d)" value={data.dailyUsage} />
          </StaggerItem>
          <StaggerItem>
            <Stat label="Open bugs" value={data.openBugs} />
          </StaggerItem>
          <StaggerItem>
            <Stat label="Crash rate %" value={data.crashRate} />
          </StaggerItem>
        </StaggerGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feature usage</CardTitle>
            <CardDescription>API avg {data?.apiAvgMs ?? 0}ms · errors {data?.errors ?? 0}</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <NamedBarChart data={data?.featureUsage ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => createInvite.mutate()}>
                Create invite code
              </Button>
              <Input
                className="max-w-xs"
                placeholder="BETA-XXXX"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => acceptInvite.mutate()}>
                Accept code
              </Button>
              {inviteCode && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteCode);
                    toast.success('Copied');
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-1 max-h-40 overflow-auto">
              {(data?.invitations ?? []).slice(0, 8).map((i) => (
                <div key={i.id} className="flex justify-between text-xs border-b py-1">
                  <span className="font-mono">{i.code}</span>
                  <Badge className="text-[9px]">{i.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Title"
              value={announceTitle}
              onChange={(e) => setAnnounceTitle(e.target.value)}
            />
            <textarea
              className="w-full min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Body"
              value={announceBody}
              onChange={(e) => setAnnounceBody(e.target.value)}
            />
            <Button
              size="sm"
              disabled={announceTitle.length < 3 || announceBody.length < 3}
              onClick={() => announce.mutate()}
            >
              Publish
            </Button>
            <div className="space-y-2">
              {(data?.announcements ?? []).map((a) => (
                <div key={a.id} className="rounded-lg border p-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge className="text-[9px]">{a.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.recentFeedback ?? []).map((f) => (
              <div key={f.id} className="flex justify-between text-sm border-b py-2">
                <span>{f.title}</span>
                <div className="flex gap-1">
                  <Badge className="text-[9px]">{f.type}</Badge>
                  <Badge className="text-[9px]">{f.severity}</Badge>
                </div>
              </div>
            ))}
            {(data?.recentFeedback ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No feedback yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
