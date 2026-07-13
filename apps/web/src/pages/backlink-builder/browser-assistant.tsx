import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

export function BrowserAssistantPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const flags = useFeatureFlags();
  const assistFillEnabled = flags.isEnabled('v11_browser_assist_fill');
  const qc = useQueryClient();
  const [opportunityId, setOpportunityId] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);

  const plan = useQuery({
    queryKey: ['browser-plan', projectId, planId],
    queryFn: () =>
      request<{
        data: {
          id: string;
          plan_steps: Array<{ order: number; action: string; detail: string; requiresUser: boolean }>;
          blockers: Array<{ type: string; message: string }>;
          status: string;
          metrics_source: string;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/browser/plans/${planId}`),
    enabled: !!planId,
  });

  const create = useMutation({
    mutationFn: () =>
      request<{ data: { id: string } }>(`/v1/projects/${projectId}/backlink-builder/browser/plans`, {
        method: 'POST',
        body: JSON.stringify({ opportunityId }),
      }),
    onSuccess: (res) => {
      setPlanId(res.data.id);
      toast.success('Action plan ready');
      qc.invalidateQueries({ queryKey: ['browser-plan', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assist = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/browser/plans/${planId}/assist`, {
        method: 'POST',
      }),
    onSuccess: () => toast.success('Assist session started (will pause for protected steps)'),
    onError: (e: Error) => toast.error(e.message),
  });

  const steps = plan.data?.data.plan_steps ?? [];
  const blockers = plan.data?.data.blockers ?? [];

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Globe className="h-6 w-6" /> Browser Assistant
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detect forms and blockers, then follow an action plan. CAPTCHA/login are never bypassed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create action plan</CardTitle>
          <CardDescription>Paste an opportunity UUID from Explorer or Queue.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input
            className="max-w-md"
            placeholder="Opportunity UUID"
            value={opportunityId}
            onChange={(e) => setOpportunityId(e.target.value)}
          />
          <Button disabled={!opportunityId || create.isPending} onClick={() => create.mutate()}>
            Generate plan
          </Button>
        </CardContent>
      </Card>

      {plan.data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Steps</CardTitle>
              <CardDescription>
                Source: {plan.data.data.metrics_source} · Status: {plan.data.data.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((s) => (
                <div key={s.order} className="border rounded p-3 text-sm">
                  <p className="font-medium">
                    {s.order}. {s.action}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">{s.detail}</p>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(steps.map((s) => `${s.order}. ${s.action}: ${s.detail}`).join('\n'))}
              >
                Copy plan
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Blockers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {blockers.map((b) => (
                <Badge key={b.type} className="block w-fit text-[10px]">
                  {b.type}: {b.message}
                </Badge>
              ))}
              {blockers.length === 0 && <p className="text-sm text-muted-foreground">No hard blockers detected.</p>}
              <Button
                className="w-full mt-4"
                disabled={!assistFillEnabled || assist.isPending || !planId}
                title={!assistFillEnabled ? 'Enable v11_browser_assist_fill feature flag' : undefined}
                onClick={() => assist.mutate()}
              >
                Assist Fill {assistFillEnabled ? '' : '(flag off)'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageTransition>
  );
}
