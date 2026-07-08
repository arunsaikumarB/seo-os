import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { BacklinkBuilderHero, BacklinkBuilderWidget } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkOpportunity, BacklinkSummary } from '@/components/backlink-builder/types';
import { scoreBadgeClass, formatType } from '@/components/backlink-builder/types';
import { Sparkles, ArrowRight, Target, ShieldCheck, Link2 } from 'lucide-react';

export function BacklinkBuilderDashboardPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();

  const summary = useQuery({
    queryKey: ['backlink-summary', projectId],
    queryFn: () =>
      request<{ data: BacklinkSummary }>(`/v1/projects/${projectId}/backlink-builder/summary`),
    enabled: !!projectId,
    refetchInterval: 25_000,
  });

  const suggestions = useQuery({
    queryKey: ['backlink-ai-suggestions', projectId],
    queryFn: () =>
      request<{
        data: {
          recommendedTypes: string[];
          topOpportunities: BacklinkOpportunity[];
          insight: string;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/ai/suggestions`),
    enabled: !!projectId,
  });

  const opportunities = useQuery({
    queryKey: ['backlink-opportunities-top', projectId],
    queryFn: () =>
      request<{ data: BacklinkOpportunity[] }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities?minScore=70`
      ),
    enabled: !!projectId,
  });

  const data = summary.data?.data;

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Backlink Builder"
        subtitle="The central workspace for discovering, scoring, approving, and verifying every backlink opportunity."
      />

      {isDemoMode && (
        <Badge className="border-primary/30 text-primary">Live Demo — AI workforce active</Badge>
      )}

      {summary.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : data ? (
        <BacklinkBuilderWidget summary={data} projectId={projectId} />
      ) : null}

      <StaggerGrid className="grid gap-4 lg:grid-cols-3">
        <StaggerItem>
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                <AnimatedCounter value={data?.totalOpportunities ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">Across 26 backlink types</p>
              <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                <Link to={`/projects/${projectId}/backlink-builder/explorer`}>
                  Explore <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Active Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                <AnimatedCounter value={data?.activeCampaigns ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">Opportunities attached to campaigns</p>
              <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                <Link to={`/projects/${projectId}/campaigns`}>
                  View campaigns <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Verified</span>
                <span className="font-medium text-primary">{data?.verified ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending</span>
                <span>{data?.pending ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lost</span>
                <span>{data?.lost ?? 0}</span>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                <Link to={`/projects/${projectId}/backlink-builder/audit`}>
                  Link audit <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Recommendations
            </CardTitle>
            <CardDescription>Strategic backlink type suggestions for this project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <p className="text-sm">{suggestions.data?.data.insight}</p>
                <div className="flex flex-wrap gap-1">
                  {(suggestions.data?.data.recommendedTypes ?? []).map((t) => (
                    <Badge key={t} className="text-[10px] capitalize">
                      {formatType(t)}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Scored Opportunities</CardTitle>
            <CardDescription>AI-ranked opportunities ready for review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(opportunities.data?.data ?? suggestions.data?.data.topOpportunities ?? [])
              .slice(0, 5)
              .map((opp) => (
                <Link
                  key={opp.id}
                  to={`/projects/${projectId}/backlink-builder/opportunities/${opp.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{opp.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {formatType(opp.opportunity_type)}
                    </p>
                  </div>
                  <Badge className={scoreBadgeClass(opp.score)}>{opp.score}</Badge>
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
