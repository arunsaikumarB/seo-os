import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { WebsiteScanAnimation } from '@/components/demo/website-scan-animation';
import { PageTransition } from '@/components/demo/page-transition';
import { Globe, Radar } from 'lucide-react';

export function WebsiteAnalyzerPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const scans = useQuery({
    queryKey: ['website-scans', projectId, isDemoMode],
    queryFn: () =>
      request<{ data: Array<Record<string, unknown>> }>(
        `/v1/projects/${projectId}/intelligence/website/scans`
      ),
    enabled: !!projectId,
    refetchInterval: scanning ? false : 10_000,
  });

  const discover = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        setScanning(true);
        return { data: { status: 'started' } };
      }
      return request(`/v1/projects/${projectId}/intelligence/discover`, { method: 'POST' });
    },
    onSuccess: () => {
      if (!isDemoMode) {
        toast.success('Full SEO discovery started');
        queryClient.invalidateQueries({ queryKey: ['website-scans', projectId] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scan = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        setScanning(true);
        return { data: { id: 'scan-new' } };
      }
      return request(`/v1/projects/${projectId}/intelligence/website/scans`, { method: 'POST', body: '{}' });
    },
    onSuccess: () => {
      if (!isDemoMode) {
        toast.success('Website scan started');
        queryClient.invalidateQueries({ queryKey: ['website-scans', projectId] });
      }
    },
  });

  const latest = scans.data?.data?.[0];

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website Analyzer</h1>
          <p className="text-muted-foreground">Sitemap discovery, metadata, schema, and brand profile</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending || scanning}>
            <Globe className="h-4 w-4 mr-1" /> Scan website
          </Button>
          <Button onClick={() => discover.mutate()} disabled={discover.isPending || scanning}>
            <Radar className="h-4 w-4 mr-1" /> Run full discovery
          </Button>
        </div>
      </div>

      <WebsiteScanAnimation
        active={scanning}
        onComplete={() => {
          setScanning(false);
          toast.success('Website analysis complete — 47 pages, 12 opportunities found');
          queryClient.invalidateQueries({ queryKey: ['website-scans', projectId] });
        }}
      />

      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Latest scan</CardTitle>
          <CardDescription>Onboarding and content inventory</CardDescription>
        </CardHeader>
        <CardContent>
          {scans.isLoading && !isDemoMode ? (
            <Skeleton className="h-24 w-full" />
          ) : !latest && !isDemoMode ? (
            <p className="text-sm text-muted-foreground">No scans yet. Start a website scan.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge>{String(latest?.status ?? 'completed')}</Badge>
                <span className="text-muted-foreground">Phase: {String(latest?.phase ?? 'completed')}</span>
              </div>
              <p>
                <span className="text-muted-foreground">URL:</span> {String(latest?.target_url ?? 'https://chefgaa.com')}
              </p>
              <p>
                Pages: {String(latest?.pages_analyzed ?? 47)} analyzed / {String(latest?.pages_discovered ?? 52)}{' '}
                discovered
              </p>
              {latest?.brand_profile != null && (
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-40">
                  {JSON.stringify(latest.brand_profile, null, 2)}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
