import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMissionControl } from '@/hooks/use-mission-control';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { AIWorkforcePanel } from '@/components/demo/ai-workforce-panel';
import { KnowledgeEngineViz } from '@/components/demo/knowledge-viz';
import { LiveTimeline } from '@/components/demo/live-timeline';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { WorkflowCelebration } from '@/components/workflow/workflow-celebration';
import { BacklinkBuilderWidget } from '@/components/backlink-builder/backlink-builder-widget';
import { AutomationWidget } from '@/components/backlink-builder/automation-widget';
import { BrowserIntelligenceWidget } from '@/components/intelligence/browser-intelligence-widget';
import { RelationshipIntelligenceWidget } from '@/components/relationships/relationship-intelligence-widget';
import { OutreachWidget } from '@/components/outreach/outreach-widget';
import { WorkflowWidget } from '@/components/workflows/workflow-widget';
import { AnalyticsMissionWidget } from '@/components/analytics/analytics-mission-widget';
import { ReportsMissionWidget } from '@/components/reports/reports-mission-widget';
import type { WorkflowSummary } from '@/components/workflows/workflow-widget';
import type { BrowserIntelligenceSummary } from '@/components/intelligence/browser-intelligence-widget';
import type { RelationshipIntelligenceSummary } from '@/components/relationships/relationship-intelligence-widget';
import type { OutreachSummary } from '@/components/outreach/outreach-widget';
import type { BacklinkSummary, AutomationSummary } from '@/components/backlink-builder/types';
import { usePlatformActivity } from '@/hooks/use-platform';
import { usePlatformRealtime } from '@/hooks/use-platform-realtime';
import { useAuth } from '@/providers/auth-provider';
import {
  Bot,
  Activity,
  HeartPulse,
  Layers,
  Server,
  BookOpen,
  MessageSquare,
  Globe,
  Radar,
  Target,
  Link2,
  ShieldCheck,
  Users,
  CheckSquare,
  Zap,
  Radio,
} from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'healthy' || status === 'completed' || status === 'registered'
      ? 'border-primary/30 text-primary'
      : status === 'degraded' || status === 'running' || status === 'queued'
        ? 'border-amber-500/30 text-amber-600'
        : 'border-muted-foreground/30 text-muted-foreground';
  return <Badge className={className}>{status}</Badge>;
}

export function MissionControlPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const { agents, health, runs, events, queue, providers } = useMissionControl(projectId);
  const platformActivity = usePlatformActivity(projectId);

  usePlatformRealtime({
    workspaceId: projectId,
    userId: user?.id,
    enabled: !isDemoMode && !!projectId,
  });

  const summary = useQuery({
    queryKey: ['mission-control-summary', projectId],
    queryFn: () =>
      request<{
        data: {
          knowledge: { readyDocuments: number; totalChunks: number };
          memory: { entries: number; facts: number };
          conversations: number;
          workforce: { registered: number; activeRuns: number; completedRuns: number };
          intelligence?: {
            websiteScanner: { status: string; phase: string; pagesAnalyzed: number };
            discovery: {
              keywordCount: number;
              prospectTotal: number;
              opportunityCounts: Record<string, number>;
            };
            timeline: Array<{ title: string; event_type: string; created_at: string }>;
          };
          campaigns?: {
            active: number;
            pendingApproval: number;
            total: number;
            avgProgress: number;
            pendingApprovals: number;
            recent: Array<{ id: string; name: string; status: string; progress: number }>;
            timeline: Array<{
              title: string;
              event_type: string;
              created_at: string;
              campaign_id: string;
            }>;
          };
          backlinkBuilder?: BacklinkSummary;
          automation?: AutomationSummary;
          browserIntelligence?: BrowserIntelligenceSummary;
          relationshipIntelligence?: RelationshipIntelligenceSummary;
          outreach?: OutreachSummary;
          workflows?: WorkflowSummary;
        };
      }>(`/v1/projects/${projectId}/mission-control/summary`),
    enabled: !!projectId,
    refetchInterval: isDemoMode ? 20_000 : false,
  });

  const agentList = (agents.data?.data ?? []) as Array<{
    agentType: string;
    displayName: string;
    description: string;
  }>;

  const runList = runs.data?.data ?? [];
  const liveEvents = events.data?.data?.live ?? [];
  const healthData = health.data?.data as Record<string, unknown> | undefined;
  const providerData = providers.data?.data;
  const queueData = queue.data?.data;

  const summaryData = summary.data?.data;

  return (
    <PageTransition className="space-y-6">
      <WorkflowCelebration projectId={projectId} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
            {isDemoMode && (
              <Badge className="text-[10px] border-primary/30 text-primary">Live Demo</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            AI Operations Center — live event bus · workforce · campaigns
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {!isDemoMode && (
            <Badge className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
              <Radio className="h-3 w-3" /> Live
            </Badge>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/command-center`}>
              <MessageSquare className="h-3 w-3 mr-1" /> Chat
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/knowledge/library`}>
              <BookOpen className="h-3 w-3 mr-1" /> Knowledge
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder`}>
              <Link2 className="h-3 w-3 mr-1" /> Backlink Builder
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/campaigns`}>
              <Link2 className="h-3 w-3 mr-1" /> Campaigns
            </Link>
          </Button>
        </div>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        summaryData && (
          <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StaggerItem>
              <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">KB documents</p>
                  <p className="text-2xl font-semibold">
                    <AnimatedCounter value={summaryData.knowledge.readyDocuments} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summaryData.knowledge.totalChunks} chunks
                  </p>
                </CardContent>
              </Card>
            </StaggerItem>
            <StaggerItem>
              <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Memory entries</p>
                  <p className="text-2xl font-semibold">
                    <AnimatedCounter value={summaryData.memory.entries} />
                  </p>
                  <p className="text-xs text-muted-foreground">{summaryData.memory.facts} facts</p>
                </CardContent>
              </Card>
            </StaggerItem>
            <StaggerItem>
              <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Conversations</p>
                  <p className="text-2xl font-semibold">
                    <AnimatedCounter value={summaryData.conversations} />
                  </p>
                </CardContent>
              </Card>
            </StaggerItem>
            <StaggerItem>
              <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Agent runs</p>
                  <p className="text-2xl font-semibold">
                    <AnimatedCounter value={summaryData.workforce.completedRuns} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summaryData.workforce.activeRuns} active
                  </p>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerGrid>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AIWorkforcePanel />
        <KnowledgeEngineViz />
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Relationship Health
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Organizations</span>
              <span className="font-medium">
                {summaryData?.relationshipIntelligence?.organizations ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Warm relationships</span>
              <span className="font-medium text-primary">
                {summaryData?.relationshipIntelligence?.warmRelationships ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending follow-ups</span>
              <span>{summaryData?.relationshipIntelligence?.pendingFollowUps ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Upcoming Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              'Approve guest post draft',
              'Review 3 opportunities',
              'Launch Digital PR campaign',
              'QA content output',
            ].map((t) => (
              <div
                key={t}
                className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">API</span>
              <StatusBadge status="healthy" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database</span>
              <StatusBadge status="healthy" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Providers</span>
              <StatusBadge status="healthy" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Workers</span>
              <StatusBadge status={queueData?.enabled ? 'healthy' : 'degraded'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <LiveTimeline title="Recent AI Decisions" limit={6} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Unified Activity Stream
          </CardTitle>
          <CardDescription>
            Platform events across scan → campaign → workflow → outreach → verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {platformActivity.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (platformActivity.data?.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No platform events yet. Complete a website scan or create a campaign to start the
              stream.
            </p>
          ) : (
            (platformActivity.data?.data?.items ?? []).slice(0, 12).map((evt) => (
              <div
                key={evt.id}
                className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{evt.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {evt.source_module.replace(/_/g, ' ')} · {evt.event_type.replace(/_/g, ' ')}
                    {evt.summary ? ` — ${evt.summary}` : ''}
                  </p>
                </div>
                <Badge className="shrink-0 text-[10px]">{evt.severity}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {summaryData?.backlinkBuilder && (
        <BacklinkBuilderWidget summary={summaryData.backlinkBuilder} projectId={projectId} />
      )}

      {summaryData?.automation && (
        <AutomationWidget summary={summaryData.automation} projectId={projectId} />
      )}

      {summaryData?.browserIntelligence && (
        <BrowserIntelligenceWidget
          summary={summaryData.browserIntelligence}
          projectId={projectId}
        />
      )}

      {summaryData?.relationshipIntelligence && (
        <RelationshipIntelligenceWidget
          summary={summaryData.relationshipIntelligence}
          projectId={projectId}
        />
      )}

      {summaryData?.outreach && (
        <OutreachWidget summary={summaryData.outreach} projectId={projectId} />
      )}
      {summaryData?.workflows && (
        <WorkflowWidget summary={summaryData.workflows} projectId={projectId} />
      )}

      <AnalyticsMissionWidget projectId={projectId} />

      <ReportsMissionWidget projectId={projectId} />

      {summaryData?.intelligence && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" /> Website Scanner
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={summaryData.intelligence.websiteScanner.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phase</span>
                <span>{summaryData.intelligence.websiteScanner.phase}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pages analyzed</span>
                <span>{summaryData.intelligence.websiteScanner.pagesAnalyzed}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="h-4 w-4" /> Discovery Status
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Keywords</span>
                <span>{summaryData.intelligence.discovery.keywordCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prospects</span>
                <span>{summaryData.intelligence.discovery.prospectTotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opportunities</span>
                <span>
                  {Object.values(summaryData.intelligence.discovery.opportunityCounts).reduce(
                    (a, b) => a + b,
                    0
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> Opportunity Counts
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {Object.entries(summaryData.intelligence.discovery.opportunityCounts).map(
                ([type, count]) => (
                  <Badge key={type} className="text-[10px]">
                    {type.replace(/_/g, ' ')}: {count}
                  </Badge>
                )
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {summaryData?.campaigns && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Active Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active</span>
                <span>{summaryData.campaigns.active}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total campaigns</span>
                <span>{summaryData.campaigns.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg progress</span>
                <span>{summaryData.campaigns.avgProgress}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Pending Approvals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approval queue</span>
                <span>{summaryData.campaigns.pendingApprovals}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaigns awaiting launch</span>
                <span>{summaryData.campaigns.pendingApproval}</span>
              </div>
              <Button variant="ghost" size="sm" className="px-0 h-auto" asChild>
                <Link to={`/projects/${projectId}/campaigns/approvals`}>Open Approval Center</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryData.campaigns.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
              ) : (
                summaryData.campaigns.recent.map((c) => (
                  <div
                    key={c.id}
                    className="flex justify-between text-sm rounded-md border px-3 py-2"
                  >
                    <Link
                      to={`/projects/${projectId}/campaigns/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="text-muted-foreground">{c.progress}%</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {summaryData?.campaigns?.timeline && summaryData.campaigns.timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Campaign Timeline
            </CardTitle>
            <CardDescription>Recent campaign lifecycle events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {summaryData.campaigns.timeline.slice(0, 8).map((evt) => (
              <div
                key={`${evt.event_type}-${evt.created_at}`}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{evt.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(evt.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{evt.event_type}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {summaryData?.intelligence?.timeline && summaryData.intelligence.timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> AI Research Timeline
            </CardTitle>
            <CardDescription>Live SEO intelligence events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {summaryData.intelligence.timeline.slice(0, 8).map((evt) => (
              <div
                key={`${evt.event_type}-${evt.created_at}`}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{evt.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(evt.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{evt.event_type}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">AI Workforce</CardTitle>
            </div>
            <CardDescription>Registered Sprint 2 agents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              agentList.map((agent) => (
                <div
                  key={agent.agentType}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{agent.displayName}</p>
                    <p className="text-xs text-muted-foreground">{agent.agentType}</p>
                  </div>
                  <StatusBadge status="registered" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">AI Health</CardTitle>
            </div>
            <CardDescription>Runtime and provider health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {health.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agents registered</span>
                  <span>{String(healthData?.agentsRegistered ?? '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Handlers ready</span>
                  <span>{String(healthData?.handlersReady ?? '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recent failures</span>
                  <span>{String(healthData?.recentFailures ?? 0)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Provider Status</CardTitle>
            </div>
            <CardDescription>Gemini primary, Ollama fallback</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {providers.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span>{providerData?.primary?.name ?? 'primary'}</span>
                  <StatusBadge status={providerData?.primary?.status ?? 'unknown'} />
                </div>
                {providerData?.fallback && (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span>{providerData.fallback.name}</span>
                    <StatusBadge status={providerData.fallback.status} />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">AI Activity Timeline</CardTitle>
            </div>
            <CardDescription>Live agent events for this project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : liveEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No AI activity yet. Run an agent to populate.
              </p>
            ) : (
              (
                liveEvents as Array<{
                  type: string;
                  createdAt: string;
                  payload: Record<string, unknown>;
                }>
              )
                .slice(0, 8)
                .map((evt) => (
                  <div
                    key={`${evt.type}-${evt.createdAt}`}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{evt.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {evt.payload?.agentType != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {String(evt.payload.agentType)}
                      </p>
                    )}
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Queue Monitor</CardTitle>
            </div>
            <CardDescription>Background job queues (pg-boss)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {queue.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <p className="text-muted-foreground mb-2">
                  Workers {queueData?.enabled ? 'enabled' : 'disabled (ENABLE_WORKERS=false)'}
                </p>
                {(queueData?.queues ?? []).map((q) => (
                  <div key={q.name} className="flex justify-between rounded-md border px-3 py-2">
                    <span className="font-mono text-xs">{q.name}</span>
                    <span className="text-muted-foreground">{q.pending} pending</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Agent Runs</CardTitle>
          <CardDescription>Execution history for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : runList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runList.slice(0, 6).map((run) => (
                <div
                  key={String(run.id)}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{String(run.agent_type)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{String(run.id)}</p>
                  </div>
                  <StatusBadge status={String(run.status)} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
