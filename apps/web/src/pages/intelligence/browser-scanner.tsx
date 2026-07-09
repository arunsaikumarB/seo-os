import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { WebsiteScanAnimation } from '@/components/demo/website-scan-animation';
import { PageTransition } from '@/components/demo/page-transition';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { AIThinkingPanel } from '@/components/demo/ai-thinking-panel';
import type { BrowserIntelligenceSummary } from '@/components/intelligence/browser-intelligence-widget';
import { Brain, Globe, History, User, ArrowRight } from 'lucide-react';

const PIPELINE = [
  'discovering_pages',
  'reading_content',
  'extracting_metadata',
  'finding_opportunities',
  'finding_contact_pages',
  'building_profile',
  'generating_ai_summary',
  'completed',
];

type Scan = Record<string, unknown>;
type Profile = Record<string, unknown>;

export function BrowserScannerPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const thinkingSteps = PIPELINE.map((p) => p.replace(/_/g, ' ') + '...');

  const summary = useQuery({
    queryKey: ['browser-intelligence-summary', projectId],
    queryFn: () =>
      request<{ data: BrowserIntelligenceSummary }>(
        `/v1/projects/${projectId}/intelligence/browser/summary`
      ),
    enabled: !!projectId,
    refetchInterval: scanning ? 3000 : 15000,
  });

  const scans = useQuery({
    queryKey: ['browser-scans', projectId],
    queryFn: () =>
      request<{ data: Scan[] }>(`/v1/projects/${projectId}/intelligence/browser/scans`),
    enabled: !!projectId,
    refetchInterval: scanning ? 3000 : 10000,
  });

  const profiles = useQuery({
    queryKey: ['browser-profiles', projectId],
    queryFn: () =>
      request<{ data: Profile[] }>(`/v1/projects/${projectId}/intelligence/browser/profiles`),
    enabled: !!projectId,
  });

  const startScan = useMutation({
    mutationFn: () => {
      if (isDemoMode) {
        setScanning(true);
        return Promise.resolve({ data: { id: 'scan-demo' } });
      }
      return request(`/v1/projects/${projectId}/intelligence/browser/scans`, {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl || undefined }),
      });
    },
    onSuccess: () => {
      if (!isDemoMode) toast.success('Browser Intelligence scan started');
      queryClient.invalidateQueries({ queryKey: ['browser-scans', projectId] });
      queryClient.invalidateQueries({ queryKey: ['browser-intelligence-summary', projectId] });
    },
    onError: () => toast.error('Failed to start scan'),
  });

  const latest = scans.data?.data?.[0];
  const phaseIdx = PIPELINE.indexOf(String(latest?.phase ?? ''));
  const progress = phaseIdx >= 0 ? Math.round(((phaseIdx + 1) / PIPELINE.length) * 100) : 0;

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-cyan-500" /> Browser Intelligence Scanner
          </h1>
          <p className="text-muted-foreground mt-1">
            Understand websites, detect opportunities, and generate AI recommendations
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scan a Website</CardTitle>
          <CardDescription>Enter a URL or scan your project domain</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            placeholder="https://example.com"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="max-w-md"
          />
          <Button onClick={() => startScan.mutate()} disabled={startScan.isPending || scanning}>
            <Globe className="h-4 w-4 mr-1" /> Start Scan
          </Button>
        </CardContent>
      </Card>

      <WebsiteScanAnimation
        active={scanning}
        onComplete={() => {
          setScanning(false);
          toast.success('Browser Intelligence complete — profile stored in Knowledge Engine');
          queryClient.invalidateQueries({ queryKey: ['browser-scans', projectId] });
          queryClient.invalidateQueries({ queryKey: ['browser-profiles', projectId] });
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scan Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBarLabel label="Current scan" value={scanning ? 75 : progress} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PIPELINE.map((step, i) => (
                <div
                  key={step}
                  className={`rounded-md border p-2 text-center text-xs ${
                    phaseIdx >= i ? 'border-cyan-500/30 bg-cyan-500/5' : ''
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                  <p className="font-medium capitalize mt-0.5">{step.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <AIThinkingPanel
          steps={[...thinkingSteps, 'Completed.']}
          currentStep={phaseIdx >= 0 ? phaseIdx : 0}
          active={Boolean(scanning || latest?.status === 'running')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Recent Scans
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scans.isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              (scans.data?.data ?? []).slice(0, 5).map((s) => (
                <Link
                  key={String(s.id)}
                  to={`/projects/${projectId}/intelligence/browser/scans/${s.id}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <div className="truncate">
                    <p className="font-medium truncate">{String(s.target_url)}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {String(s.phase ?? s.status)}
                    </p>
                  </div>
                  <Badge className="text-[10px] capitalize shrink-0">{String(s.status)}</Badge>
                </Link>
              ))
            )}
            {!scans.data?.data?.length && (
              <p className="text-sm text-muted-foreground">No scans yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Website Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(profiles.data?.data ?? []).slice(0, 5).map((p) => (
              <div key={String(p.id)} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{String(p.website_name ?? p.domain)}</p>
                <p className="text-xs text-muted-foreground">
                  {String(p.domain)} · DR {String(p.domain_authority ?? '—')}
                </p>
                {p.ai_summary != null && (
                  <p className="text-xs mt-1 line-clamp-2">{String(p.ai_summary).split('\n')[0]}</p>
                )}
              </div>
            ))}
            {!profiles.data?.data?.length && (
              <p className="text-sm text-muted-foreground">Profiles appear after first scan.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.data?.data && (
        <Card className="border-muted">
          <CardContent className="pt-4 text-xs text-muted-foreground italic">
            {summary.data.data.disclaimer}
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}

export function BrowserScanDetailPage() {
  const { projectId = '', scanId = '' } = useParams();
  const { request } = useApi();

  const detail = useQuery({
    queryKey: ['browser-scan-detail', projectId, scanId],
    queryFn: () =>
      request<{ data: { scan: Scan; pages: Scan[]; discoveries: Scan[] } }>(
        `/v1/projects/${projectId}/intelligence/website/scans/${scanId}`
      ),
    enabled: !!projectId && !!scanId,
  });

  const scan = detail.data?.data?.scan;
  const pages = detail.data?.data?.pages ?? [];
  const discoveries = detail.data?.data?.discoveries ?? [];

  return (
    <PageTransition className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/projects/${projectId}/intelligence/browser`}>
          <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to Scanner
        </Link>
      </Button>

      {detail.isLoading ? (
        <Skeleton className="h-48" />
      ) : scan ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">{String(scan.target_url)}</h1>
            <div className="flex gap-2 mt-2">
              <Badge className="capitalize">{String(scan.status)}</Badge>
              <Badge className="capitalize border-muted-foreground/30">{String(scan.phase)}</Badge>
            </div>
          </div>

          {scan.ai_summary != null && (
            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">AI Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {String(scan.ai_summary)}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pages ({pages.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-64 overflow-auto text-xs">
                {pages.map((p) => (
                  <div key={String(p.id)} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{String(p.title ?? p.path)}</span>
                    <Badge className="text-[9px] capitalize shrink-0">
                      {String(p.page_type ?? 'content')}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Discoveries ({discoveries.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-64 overflow-auto text-xs">
                {discoveries.map((d) => (
                  <div key={String(d.id)} className="border-b py-1">
                    <p className="font-medium">{String(d.title)}</p>
                    <p className="text-muted-foreground capitalize">
                      {String(d.discovery_type)} · {String(d.confidence)}%
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Scan not found.</p>
      )}
    </PageTransition>
  );
}
