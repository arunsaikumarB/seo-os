import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { DemoModeProvider } from '@/providers/demo-mode-provider';
import { ProductTour } from '@/components/demo/product-tour';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { OrgBootstrap } from '@/components/layout/org-bootstrap';
import { AppShell } from '@/components/layout/app-shell';
import { AppLayout } from '@/components/layout/app-layout';
import { OrgShell } from '@/components/layout/org-shell';
import { Skeleton } from '@/components/ui/skeleton';

const LoginPage = lazy(() =>
  import('@/pages/login').then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
  import('@/pages/signup').then((m) => ({ default: m.SignupPage }))
);
const ProjectsPage = lazy(() =>
  import('@/pages/projects').then((m) => ({ default: m.ProjectsPage }))
);
const MissionControlPage = lazy(() =>
  import('@/pages/mission-control').then((m) => ({ default: m.MissionControlPage }))
);
const ProjectHomePage = lazy(() =>
  import('@/pages/project-home').then((m) => ({ default: m.ProjectHomePage }))
);
const CommandCenterPage = lazy(() =>
  import('@/pages/command-center').then((m) => ({ default: m.CommandCenterPage }))
);
const KnowledgeLibraryPage = lazy(() =>
  import('@/pages/knowledge/library').then((m) => ({ default: m.KnowledgeLibraryPage }))
);
const WebsiteAnalyzerPage = lazy(() =>
  import('@/pages/intelligence/website-analyzer').then((m) => ({
    default: m.WebsiteAnalyzerPage,
  }))
);
const BrowserScannerPage = lazy(() =>
  import('@/pages/intelligence/browser-scanner').then((m) => ({ default: m.BrowserScannerPage }))
);
const BrowserScanDetailPage = lazy(() =>
  import('@/pages/intelligence/browser-scanner').then((m) => ({
    default: m.BrowserScanDetailPage,
  }))
);
const RelationshipHubPage = lazy(() =>
  import('@/pages/relationships/hub').then((m) => ({ default: m.RelationshipHubPage }))
);
const OrganizationDetailPage = lazy(() =>
  import('@/pages/relationships/organization-detail').then((m) => ({
    default: m.OrganizationDetailPage,
  }))
);
const OutreachInboxPage = lazy(() =>
  import('@/pages/outreach/inbox').then((m) => ({ default: m.OutreachInboxPage }))
);
const EmailStudioPage = lazy(() =>
  import('@/pages/outreach/studio').then((m) => ({ default: m.EmailStudioPage }))
);
const SequenceBuilderPage = lazy(() =>
  import('@/pages/outreach/sequences').then((m) => ({ default: m.SequenceBuilderPage }))
);
const KeywordsPage = lazy(() =>
  import('@/pages/intelligence/keywords').then((m) => ({ default: m.KeywordsPage }))
);
const CompetitorsPage = lazy(() =>
  import('@/pages/competitors').then((m) => ({ default: m.CompetitorsPage }))
);
const ProspectPipelinePage = lazy(() =>
  import('@/pages/prospects/pipeline').then((m) => ({ default: m.ProspectPipelinePage }))
);
const CampaignsPage = lazy(() =>
  import('@/pages/campaigns/index').then((m) => ({ default: m.CampaignsPage }))
);
const CampaignDetailPage = lazy(() =>
  import('@/pages/campaigns/detail').then((m) => ({ default: m.CampaignDetailPage }))
);
const OpportunityQueuePage = lazy(() =>
  import('@/pages/campaigns/opportunity-queue').then((m) => ({
    default: m.OpportunityQueuePage,
  }))
);
const BacklinkBuilderDashboardPage = lazy(() =>
  import('@/pages/backlink-builder/dashboard').then((m) => ({
    default: m.BacklinkBuilderDashboardPage,
  }))
);
const BacklinkExplorerPage = lazy(() =>
  import('@/pages/backlink-builder/explorer').then((m) => ({ default: m.BacklinkExplorerPage }))
);
const BacklinkOpportunityDetailPage = lazy(() =>
  import('@/pages/backlink-builder/detail').then((m) => ({
    default: m.BacklinkOpportunityDetailPage,
  }))
);
const BacklinkPipelinePage = lazy(() =>
  import('@/pages/backlink-builder/pipeline').then((m) => ({ default: m.BacklinkPipelinePage }))
);
const BacklinkWonPage = lazy(() =>
  import('@/pages/backlink-builder/won').then((m) => ({ default: m.BacklinkWonPage }))
);
const BacklinkLostPage = lazy(() =>
  import('@/pages/backlink-builder/lost').then((m) => ({ default: m.BacklinkLostPage }))
);
const BacklinkPendingPage = lazy(() =>
  import('@/pages/backlink-builder/pending').then((m) => ({ default: m.BacklinkPendingPage }))
);
const BacklinkAuditPage = lazy(() =>
  import('@/pages/backlink-builder/audit').then((m) => ({ default: m.BacklinkAuditPage }))
);
const BacklinkRelationshipsPage = lazy(() =>
  import('@/pages/backlink-builder/relationships').then((m) => ({
    default: m.BacklinkRelationshipsPage,
  }))
);
const BacklinkCampaignsPage = lazy(() =>
  import('@/pages/backlink-builder/campaigns').then((m) => ({
    default: m.BacklinkCampaignsPage,
  }))
);
const BacklinkRecommendationsPage = lazy(() =>
  import('@/pages/backlink-builder/recommendations-v11').then((m) => ({
    default: m.RecommendationsPage,
  }))
);
const BacklinkImportPage = lazy(() =>
  import('@/pages/backlink-builder/import').then((m) => ({ default: m.BacklinkImportPage }))
);
const BacklinkDiscoverPage = lazy(() =>
  import('@/pages/backlink-builder/discover').then((m) => ({ default: m.BacklinkDiscoverPage }))
);
const BacklinkAutomationPage = lazy(() =>
  import('@/pages/backlink-builder/automation').then((m) => ({
    default: m.BacklinkAutomationPage,
  }))
);
const BacklinkTrackingPage = lazy(() =>
  import('@/pages/backlink-builder/tracking').then((m) => ({ default: m.BacklinkTrackingPage }))
);
const SubmissionQueuePage = lazy(() =>
  import('@/pages/backlink-builder/queue').then((m) => ({ default: m.SubmissionQueuePage }))
);
const BrowserAssistantPage = lazy(() =>
  import('@/pages/backlink-builder/browser-assistant').then((m) => ({
    default: m.BrowserAssistantPage,
  }))
);
const ImageStudioPage = lazy(() =>
  import('@/pages/backlink-builder/media-studios').then((m) => ({ default: m.ImageStudioPage }))
);
const VideoStudioPage = lazy(() =>
  import('@/pages/backlink-builder/media-studios').then((m) => ({ default: m.VideoStudioPage }))
);
const ApprovalCenterPage = lazy(() =>
  import('@/pages/campaigns/approval-center').then((m) => ({ default: m.ApprovalCenterPage }))
);
const MemoryTimelinePage = lazy(() =>
  import('@/pages/memory/timeline').then((m) => ({ default: m.MemoryTimelinePage }))
);
const SearchPage = lazy(() => import('@/pages/search').then((m) => ({ default: m.SearchPage })));
const OnboardingWelcomePage = lazy(() =>
  import('@/pages/onboarding/welcome').then((m) => ({ default: m.OnboardingWelcomePage }))
);
const OnboardingOrganizationPage = lazy(() =>
  import('@/pages/onboarding/organization').then((m) => ({
    default: m.OnboardingOrganizationPage,
  }))
);
const OnboardingProjectPage = lazy(() =>
  import('@/pages/onboarding/project').then((m) => ({ default: m.OnboardingProjectPage }))
);
const OrgTeamPage = lazy(() =>
  import('@/pages/org/team').then((m) => ({ default: m.OrgTeamPage }))
);
const OrgSettingsGeneralPage = lazy(() =>
  import('@/pages/org/settings/general').then((m) => ({ default: m.OrgSettingsGeneralPage }))
);
const ExecutiveDashboardPage = lazy(() =>
  import('@/pages/org/executive').then((m) => ({ default: m.ExecutiveDashboardPage }))
);
const WorkflowsPage = lazy(() =>
  import('@/pages/workflows/index').then((m) => ({ default: m.WorkflowsPage }))
);
const WorkflowTemplatesPage = lazy(() =>
  import('@/pages/workflows/templates').then((m) => ({ default: m.WorkflowTemplatesPage }))
);
const WorkflowBuilderPage = lazy(() =>
  import('@/pages/workflows/builder').then((m) => ({ default: m.WorkflowBuilderPage }))
);
const WorkflowRunsPage = lazy(() =>
  import('@/pages/workflows/runs').then((m) => ({ default: m.WorkflowRunsPage }))
);
const AnalyticsOverviewPage = lazy(() =>
  import('@/pages/analytics/overview').then((m) => ({ default: m.AnalyticsOverviewPage }))
);
const AnalyticsSectionPage = lazy(() =>
  import('@/pages/analytics/section').then((m) => ({ default: m.AnalyticsSectionPage }))
);
const ReportsLibraryPage = lazy(() =>
  import('@/pages/reports/library').then((m) => ({ default: m.ReportsLibraryPage }))
);
const TechnicalSeoOverviewPage = lazy(() =>
  import('@/pages/technical/overview').then((m) => ({ default: m.TechnicalSeoOverviewPage }))
);
const IntegrationsHubPage = lazy(() =>
  import('@/pages/integrations/hub').then((m) => ({ default: m.IntegrationsHubPage }))
);
const HelpCenterPage = lazy(() =>
  import('@/pages/help/center').then((m) => ({ default: m.HelpCenterPage }))
);
const FeedbackCenterPage = lazy(() =>
  import('@/pages/beta/feedback').then((m) => ({ default: m.FeedbackCenterPage }))
);
const BetaDashboardPage = lazy(() =>
  import('@/pages/beta/dashboard').then((m) => ({ default: m.BetaDashboardPage }))
);
const OrgNotificationsPage = lazy(() =>
  import('@/pages/org/settings/notifications').then((m) => ({
    default: m.OrgNotificationsPage,
  }))
);
const OrgAuditLogPage = lazy(() =>
  import('@/pages/org/audit-log').then((m) => ({ default: m.OrgAuditLogPage }))
);
const AgentsCatalogPage = lazy(() =>
  import('@/pages/agents/catalog').then((m) => ({ default: m.AgentsCatalogPage }))
);
const ContentLibraryPage = lazy(() =>
  import('@/pages/content/library').then((m) => ({ default: m.ContentLibraryPage }))
);
const ProjectSettingsPage = lazy(() =>
  import('@/pages/settings/general').then((m) => ({ default: m.ProjectSettingsPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
});

function ProjectLayout() {
  const { projectId = '' } = useParams();
  return <AppShell projectId={projectId} />;
}

function RouteFallback() {
  return (
    <div className="p-6 space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function lazyEl(Comp: ComponentType) {
  return (
    <Lazy>
      <Comp />
    </Lazy>
  );
}

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <DemoModeProvider>
            <BrowserRouter>
              <OrgBootstrap>
                <ProductTour />
                <Routes>
                  <Route path="/login" element={lazyEl(LoginPage)} />
                  <Route path="/signup" element={lazyEl(SignupPage)} />

                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute>
                        {lazyEl(OnboardingWelcomePage)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboarding/organization"
                    element={
                      <ProtectedRoute>
                        {lazyEl(OnboardingOrganizationPage)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboarding/project"
                    element={
                      <ProtectedRoute>
                        {lazyEl(OnboardingProjectPage)}
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/projects"
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={lazyEl(ProjectsPage)} />
                  </Route>

                  <Route
                    path="/org"
                    element={
                      <ProtectedRoute>
                        <OrgShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="team" replace />} />
                    <Route path="team" element={lazyEl(OrgTeamPage)} />
                    <Route path="executive" element={lazyEl(ExecutiveDashboardPage)} />
                    <Route path="integrations" element={lazyEl(IntegrationsHubPage)} />
                    <Route path="help" element={lazyEl(HelpCenterPage)} />
                    <Route path="feedback" element={lazyEl(FeedbackCenterPage)} />
                    <Route path="beta" element={lazyEl(BetaDashboardPage)} />
                    <Route path="settings/general" element={lazyEl(OrgSettingsGeneralPage)} />
                    <Route
                      path="settings/notifications"
                      element={lazyEl(OrgNotificationsPage)}
                    />
                    <Route path="audit-log" element={lazyEl(OrgAuditLogPage)} />
                  </Route>

                  <Route
                    path="/projects/:projectId"
                    element={
                      <ProtectedRoute>
                        <ProjectLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="home" replace />} />
                    <Route path="home" element={lazyEl(ProjectHomePage)} />
                    <Route path="mission-control" element={lazyEl(MissionControlPage)} />
                    <Route
                      path="backlink-builder"
                      element={lazyEl(BacklinkBuilderDashboardPage)}
                    />
                    <Route
                      path="backlink-builder/explorer"
                      element={lazyEl(BacklinkExplorerPage)}
                    />
                    <Route
                      path="backlink-builder/opportunities/:opportunityId"
                      element={lazyEl(BacklinkOpportunityDetailPage)}
                    />
                    <Route
                      path="backlink-builder/pipeline"
                      element={lazyEl(BacklinkPipelinePage)}
                    />
                    <Route path="backlink-builder/won" element={lazyEl(BacklinkWonPage)} />
                    <Route path="backlink-builder/lost" element={lazyEl(BacklinkLostPage)} />
                    <Route path="backlink-builder/pending" element={lazyEl(BacklinkPendingPage)} />
                    <Route
                      path="backlink-builder/verification"
                      element={lazyEl(BacklinkPendingPage)}
                    />
                    <Route
                      path="backlink-builder/recommendations"
                      element={lazyEl(BacklinkRecommendationsPage)}
                    />
                    <Route
                      path="backlink-builder/relationships"
                      element={lazyEl(BacklinkRelationshipsPage)}
                    />
                    <Route
                      path="backlink-builder/campaigns"
                      element={lazyEl(BacklinkCampaignsPage)}
                    />
                    <Route path="backlink-builder/audit" element={lazyEl(BacklinkAuditPage)} />
                    <Route path="backlink-builder/import" element={lazyEl(BacklinkImportPage)} />
                    <Route
                      path="backlink-builder/discover"
                      element={lazyEl(BacklinkDiscoverPage)}
                    />
                    <Route
                      path="backlink-builder/automation"
                      element={lazyEl(BacklinkAutomationPage)}
                    />
                    <Route
                      path="backlink-builder/tracking"
                      element={lazyEl(BacklinkTrackingPage)}
                    />
                    <Route path="backlink-builder/queue" element={lazyEl(SubmissionQueuePage)} />
                    <Route
                      path="backlink-builder/browser-assistant"
                      element={lazyEl(BrowserAssistantPage)}
                    />
                    <Route
                      path="backlink-builder/image-studio"
                      element={lazyEl(ImageStudioPage)}
                    />
                    <Route
                      path="backlink-builder/video-studio"
                      element={lazyEl(VideoStudioPage)}
                    />
                    <Route path="command-center" element={lazyEl(CommandCenterPage)} />
                    <Route path="knowledge/library" element={lazyEl(KnowledgeLibraryPage)} />
                    <Route path="memory/timeline" element={lazyEl(MemoryTimelinePage)} />
                    <Route path="intelligence/website" element={lazyEl(WebsiteAnalyzerPage)} />
                    <Route path="intelligence/browser" element={lazyEl(BrowserScannerPage)} />
                    <Route
                      path="intelligence/browser/scans/:scanId"
                      element={lazyEl(BrowserScanDetailPage)}
                    />
                    <Route path="relationships" element={lazyEl(RelationshipHubPage)} />
                    <Route
                      path="relationships/organizations/:orgId"
                      element={lazyEl(OrganizationDetailPage)}
                    />
                    <Route path="outreach/inbox" element={lazyEl(OutreachInboxPage)} />
                    <Route path="outreach/studio" element={lazyEl(EmailStudioPage)} />
                    <Route path="outreach/sequences" element={lazyEl(SequenceBuilderPage)} />
                    <Route path="intelligence/keywords" element={lazyEl(KeywordsPage)} />
                    <Route path="competitors" element={lazyEl(CompetitorsPage)} />
                    <Route path="prospects/pipeline" element={lazyEl(ProspectPipelinePage)} />
                    <Route path="campaigns" element={lazyEl(CampaignsPage)} />
                    <Route path="campaigns/queue" element={lazyEl(OpportunityQueuePage)} />
                    <Route path="campaigns/approvals" element={lazyEl(ApprovalCenterPage)} />
                    <Route path="campaigns/:campaignId" element={lazyEl(CampaignDetailPage)} />
                    <Route path="workflows" element={lazyEl(WorkflowsPage)} />
                    <Route path="workflows/templates" element={lazyEl(WorkflowTemplatesPage)} />
                    <Route path="workflows/runs" element={lazyEl(WorkflowRunsPage)} />
                    <Route path="workflows/:workflowId" element={lazyEl(WorkflowBuilderPage)} />
                    <Route path="analytics/overview" element={lazyEl(AnalyticsOverviewPage)} />
                    <Route path="analytics/:section" element={lazyEl(AnalyticsSectionPage)} />
                    <Route path="reports/library" element={lazyEl(ReportsLibraryPage)} />
                    <Route path="technical/overview" element={lazyEl(TechnicalSeoOverviewPage)} />
                    <Route path="integrations/hub" element={lazyEl(IntegrationsHubPage)} />
                    <Route path="agents/catalog" element={lazyEl(AgentsCatalogPage)} />
                    <Route path="content/library" element={lazyEl(ContentLibraryPage)} />
                    <Route path="settings/general" element={lazyEl(ProjectSettingsPage)} />
                    <Route path="search" element={lazyEl(SearchPage)} />
                  </Route>

                  <Route path="/" element={<Navigate to="/projects" replace />} />
                  <Route path="*" element={<Navigate to="/projects" replace />} />
                </Routes>
              </OrgBootstrap>
            </BrowserRouter>
          </DemoModeProvider>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
