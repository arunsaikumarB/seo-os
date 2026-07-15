import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Radar, Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';

type Candidate = {
  domain: string;
  title: string;
  opportunityType: string;
  score: number;
  relevanceScore: number;
  domainRating: number;
  monthlyTraffic: number;
  difficulty: number;
  priority: string;
  metricsSource: string;
};

type DiscoverResult = {
  runId: string;
  stats: { candidates: number; created: number };
  candidates: Candidate[];
  disclaimer?: string;
};

export function BacklinkDiscoverPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('US');
  const [keywords, setKeywords] = useState('');
  const [targetDr, setTargetDr] = useState('30');
  const [targetTraffic, setTargetTraffic] = useState('1000');
  const [primaryKw, setPrimaryKw] = useState('');
  const [lastResult, setLastResult] = useState<DiscoverResult | null>(null);

  const runs = useQuery({
    queryKey: ['discover-runs', projectId],
    queryFn: () =>
      request<{ data: Array<{ id: string; status: string; stats: Record<string, number>; created_at: string }> }>(
        `/v1/projects/${projectId}/backlink-builder/automation/discover/runs`
      ),
    enabled: !!projectId,
  });

  const keywordsQ = useQuery({
    queryKey: ['bb-keywords', projectId],
    queryFn: () =>
      request<{ data: Array<{ keyword: string; metadata?: { search_volume?: number; difficulty?: number } }> }>(
        `/v1/projects/${projectId}/backlink-builder/automation/keywords`
      ),
    enabled: !!projectId,
  });

  const discover = useMutation({
    mutationFn: () =>
      request<{ data: DiscoverResult }>(`/v1/projects/${projectId}/backlink-builder/discover`, {
        method: 'POST',
        body: JSON.stringify({
          website: website || undefined,
          industry: industry || undefined,
          country: country || undefined,
          keywords: keywords
            .split(/[,;\n]/)
            .map((k) => k.trim())
            .filter(Boolean),
          targetDr: Number(targetDr) || undefined,
          targetTraffic: Number(targetTraffic) || undefined,
        }),
      }),
    onSuccess: (res) => {
      setLastResult(res.data);
      toast.success(`Discovered ${res.data.stats.created} new opportunities`);
      queryClient.invalidateQueries({ queryKey: ['discover-runs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-summary', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Discover failed'),
  });

  const discoverKw = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/automation/keywords/discover`, {
        method: 'POST',
        body: JSON.stringify({
          primaryKeywords: primaryKw
            .split(/[,;\n]/)
            .map((k) => k.trim())
            .filter(Boolean),
          industry: industry || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Keyword candidates generated (Estimated volumes)');
      queryClient.invalidateQueries({ queryKey: ['bb-keywords', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Keyword discovery failed'),
  });

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BacklinkBuilderNav />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Radar className="h-6 w-6" /> Discover Websites
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-assisted opportunity discovery from industry, country, and keywords. Authority and traffic are
          labeled Estimated.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discovery inputs</CardTitle>
            <CardDescription>No placeholder domains — real publisher catalog scored to your niche.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Your website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Industry</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="marketing" />
              </div>
              <div className="space-y-1">
                <Label>Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Keywords</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="seo, backlinks, content marketing"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Target DR (Estimated)</Label>
                <Input type="number" value={targetDr} onChange={(e) => setTargetDr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Target traffic (Estimated)</Label>
                <Input type="number" value={targetTraffic} onChange={(e) => setTargetTraffic(e.target.value)} />
              </div>
            </div>
            <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              {discover.isPending ? 'Discovering…' : 'Run AI Discover'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keyword engine</CardTitle>
            <CardDescription>Related / long-tail / semantic candidates — volumes & KD are Estimated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Primary keywords</Label>
              <Input
                value={primaryKw}
                onChange={(e) => setPrimaryKw(e.target.value)}
                placeholder="seo tools, guest posting"
              />
            </div>
            <Button variant="outline" onClick={() => discoverKw.mutate()} disabled={discoverKw.isPending || !primaryKw.trim()}>
              Discover keywords
            </Button>
            <div className="max-h-48 overflow-auto space-y-1">
              {(keywordsQ.data?.data ?? []).slice(0, 20).map((k) => (
                <div key={k.keyword} className="flex items-center justify-between text-sm border-b py-1">
                  <span>{k.keyword}</span>
                  <Badge className="text-[10px] border-muted-foreground/30">
                    Est. vol {k.metadata?.search_volume ?? '—'}
                  </Badge>
                </div>
              ))}
              {(keywordsQ.data?.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No keywords yet — discover above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest candidates</CardTitle>
            <CardDescription>{lastResult.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastResult.candidates.slice(0, 15).map((c) => (
              <div key={c.domain} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.domain}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="text-[10px]">{c.opportunityType}</Badge>
                  <Badge className="text-[10px] border-muted-foreground/30">Score {c.score}</Badge>
                  <Badge className="text-[10px] border-muted-foreground/30">DR Est. {c.domainRating}</Badge>
                  <Badge className="text-[10px] border-muted-foreground/30">Diff Est. {c.difficulty}</Badge>
                </div>
              </div>
            ))}
            <Button asChild variant="outline" size="sm">
              <Link to={`/projects/${projectId}/campaigns/queue`}>
                Open Opportunity Queue <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent discovery runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runs.data?.data ?? []).map((r) => (
            <div key={r.id} className="flex justify-between text-sm border-b py-2 gap-2">
              <span className="text-xs text-muted-foreground">
                {r.created_at ? new Date(r.created_at).toLocaleString() : 'Discovery run'}
              </span>
              <Badge className="text-[10px] border-muted-foreground/30">{r.status}</Badge>
              <span className="text-muted-foreground">{r.stats?.created ?? 0} created</span>
            </div>
          ))}
          {(runs.data?.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No discovery runs yet.</p>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
