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
import { LoginPage } from '@/pages/login';
import { SignupPage } from '@/pages/signup';
import { ProjectsPage } from '@/pages/projects';
import { MissionControlPage } from '@/pages/mission-control';
import { ProjectHomePage } from '@/pages/project-home';
import { CommandCenterPage } from '@/pages/command-center';
import { KnowledgeLibraryPage } from '@/pages/knowledge/library';
import { WebsiteAnalyzerPage } from '@/pages/intelligence/website-analyzer';
import { BrowserScannerPage, BrowserScanDetailPage } from '@/pages/intelligence/browser-scanner';
import { RelationshipHubPage } from '@/pages/relationships/hub';
import { OrganizationDetailPage } from '@/pages/relationships/organization-detail';
import { OutreachInboxPage } from '@/pages/outreach/inbox';
import { EmailStudioPage } from '@/pages/outreach/studio';
import { SequenceBuilderPage } from '@/pages/outreach/sequences';
import { KeywordsPage } from '@/pages/intelligence/keywords';
import { CompetitorsPage } from '@/pages/competitors';
import { ProspectPipelinePage } from '@/pages/prospects/pipeline';
import { CampaignsPage } from '@/pages/campaigns/index';
import { CampaignDetailPage } from '@/pages/campaigns/detail';
import { OpportunityQueuePage } from '@/pages/campaigns/opportunity-queue';
import { BacklinkBuilderDashboardPage } from '@/pages/backlink-builder/dashboard';
import { BacklinkExplorerPage } from '@/pages/backlink-builder/explorer';
import { BacklinkOpportunityDetailPage } from '@/pages/backlink-builder/detail';
import { BacklinkPipelinePage } from '@/pages/backlink-builder/pipeline';
import { BacklinkWonPage } from '@/pages/backlink-builder/won';
import { BacklinkLostPage } from '@/pages/backlink-builder/lost';
import { BacklinkPendingPage } from '@/pages/backlink-builder/pending';
import { BacklinkAuditPage } from '@/pages/backlink-builder/audit';
import { BacklinkRelationshipsPage } from '@/pages/backlink-builder/relationships';
import { BacklinkCampaignsPage } from '@/pages/backlink-builder/campaigns';
import { BacklinkRecommendationsPage } from '@/pages/backlink-builder/recommendations';
import { BacklinkImportPage } from '@/pages/backlink-builder/import';
import { BacklinkAutomationPage } from '@/pages/backlink-builder/automation';
import { BacklinkTrackingPage } from '@/pages/backlink-builder/tracking';
import { ApprovalCenterPage } from '@/pages/campaigns/approval-center';
import { MemoryTimelinePage } from '@/pages/memory/timeline';
import { SearchPage } from '@/pages/search';
import { OnboardingWelcomePage } from '@/pages/onboarding/welcome';
import { OnboardingOrganizationPage } from '@/pages/onboarding/organization';
import { OnboardingProjectPage } from '@/pages/onboarding/project';
import { OrgTeamPage } from '@/pages/org/team';
import { OrgSettingsGeneralPage } from '@/pages/org/settings/general';
import { ExecutiveDashboardPage } from '@/pages/org/executive';
import { PlaceholderPage } from '@/components/placeholder-page';
import { projectNav, orgNav } from '@/config/navigation';

const queryClient = new QueryClient();

function ProjectLayout() {
  const { projectId = '' } = useParams();
  return <AppShell projectId={projectId} />;
}

const IMPLEMENTED_ROUTES = new Set([
  'home',
  'mission-control',
  'backlink-builder',
  'backlink-builder/explorer',
  'backlink-builder/pipeline',
  'backlink-builder/won',
  'backlink-builder/lost',
  'backlink-builder/pending',
  'backlink-builder/audit',
  'backlink-builder/recommendations',
  'backlink-builder/relationships',
  'backlink-builder/campaigns',
  'backlink-builder/import',
  'backlink-builder/automation',
  'backlink-builder/tracking',
  'command-center',
  'knowledge/library',
  'memory/timeline',
  'intelligence/website',
  'intelligence/browser',
  'relationships',
  'relationships/organizations',
  'outreach/inbox',
  'outreach/studio',
  'outreach/sequences',
  'intelligence/keywords',
  'competitors',
  'prospects/pipeline',
  'campaigns',
  'campaigns/queue',
  'campaigns/approvals',
  'settings/general',
]);

function projectPlaceholderRoutes() {
  return projectNav
    .filter((n) => !IMPLEMENTED_ROUTES.has(n.href))
    .map((item) => (
      <Route
        key={item.href}
        path={`${item.href}/*`}
        element={
          <PlaceholderPage
            title={item.label}
            description={`${item.label} module`}
            sprint={item.sprint}
          />
        }
      />
    ));
}

function orgPlaceholderRoutes() {
  return orgNav
    .filter((n) => !['/org/team', '/org/settings/general', '/org/executive'].includes(n.href))
    .map((item) => {
      const path = item.href.replace('/org/', '');
      return (
        <Route
          key={item.href}
          path={path}
          element={
            <PlaceholderPage
              title={item.label}
              description={`${item.label} — organization`}
              sprint={item.sprint}
            />
          }
        />
      );
    });
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
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />

                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute>
                        <OnboardingWelcomePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboarding/organization"
                    element={
                      <ProtectedRoute>
                        <OnboardingOrganizationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboarding/project"
                    element={
                      <ProtectedRoute>
                        <OnboardingProjectPage />
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
                    <Route index element={<ProjectsPage />} />
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
                    <Route path="team" element={<OrgTeamPage />} />
                    <Route path="executive" element={<ExecutiveDashboardPage />} />
                    <Route path="settings/general" element={<OrgSettingsGeneralPage />} />
                    {orgPlaceholderRoutes()}
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
                    <Route path="home" element={<ProjectHomePage />} />
                    <Route path="mission-control" element={<MissionControlPage />} />
                    <Route path="backlink-builder" element={<BacklinkBuilderDashboardPage />} />
                    <Route path="backlink-builder/explorer" element={<BacklinkExplorerPage />} />
                    <Route
                      path="backlink-builder/opportunities/:opportunityId"
                      element={<BacklinkOpportunityDetailPage />}
                    />
                    <Route path="backlink-builder/pipeline" element={<BacklinkPipelinePage />} />
                    <Route path="backlink-builder/won" element={<BacklinkWonPage />} />
                    <Route path="backlink-builder/lost" element={<BacklinkLostPage />} />
                    <Route path="backlink-builder/pending" element={<BacklinkPendingPage />} />
                    <Route path="backlink-builder/verification" element={<BacklinkPendingPage />} />
                    <Route
                      path="backlink-builder/recommendations"
                      element={<BacklinkRecommendationsPage />}
                    />
                    <Route
                      path="backlink-builder/relationships"
                      element={<BacklinkRelationshipsPage />}
                    />
                    <Route path="backlink-builder/campaigns" element={<BacklinkCampaignsPage />} />
                    <Route path="backlink-builder/audit" element={<BacklinkAuditPage />} />
                    <Route path="backlink-builder/import" element={<BacklinkImportPage />} />
                    <Route
                      path="backlink-builder/automation"
                      element={<BacklinkAutomationPage />}
                    />
                    <Route path="backlink-builder/tracking" element={<BacklinkTrackingPage />} />
                    <Route path="command-center" element={<CommandCenterPage />} />
                    <Route path="knowledge/library" element={<KnowledgeLibraryPage />} />
                    <Route path="memory/timeline" element={<MemoryTimelinePage />} />
                    <Route path="intelligence/website" element={<WebsiteAnalyzerPage />} />
                    <Route path="intelligence/browser" element={<BrowserScannerPage />} />
                    <Route
                      path="intelligence/browser/scans/:scanId"
                      element={<BrowserScanDetailPage />}
                    />
                    <Route path="relationships" element={<RelationshipHubPage />} />
                    <Route
                      path="relationships/organizations/:orgId"
                      element={<OrganizationDetailPage />}
                    />
                    <Route path="outreach/inbox" element={<OutreachInboxPage />} />
                    <Route path="outreach/studio" element={<EmailStudioPage />} />
                    <Route path="outreach/sequences" element={<SequenceBuilderPage />} />
                    <Route path="intelligence/keywords" element={<KeywordsPage />} />
                    <Route path="competitors" element={<CompetitorsPage />} />
                    <Route path="prospects/pipeline" element={<ProspectPipelinePage />} />
                    <Route path="campaigns" element={<CampaignsPage />} />
                    <Route path="campaigns/queue" element={<OpportunityQueuePage />} />
                    <Route path="campaigns/approvals" element={<ApprovalCenterPage />} />
                    <Route path="campaigns/:campaignId" element={<CampaignDetailPage />} />
                    <Route path="search" element={<SearchPage />} />
                    {projectPlaceholderRoutes()}
                    <Route
                      path="settings/*"
                      element={<PlaceholderPage title="Settings" description="Project settings" />}
                    />
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
