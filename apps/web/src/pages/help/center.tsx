import { Link } from 'react-router-dom';
import { BookOpen, Keyboard, LifeBuoy, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageTransition } from '@/components/demo/page-transition';
import { useAppStore } from '@/stores/app-store';

const SHORTCUTS = [
  { keys: '?', description: 'Open keyboard shortcut help (this page)' },
  { keys: 'g then m', description: 'Go to Mission Control (from project)' },
  { keys: 'Esc', description: 'Close dialogs and tours' },
  { keys: 'Tab / Shift+Tab', description: 'Move focus between interactive controls' },
];

export function HelpCenterPage() {
  const projectId = useAppStore((s) => s.currentProjectId);

  return (
    <PageTransition className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <LifeBuoy className="h-6 w-6" /> Help Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          First-time setup, product tour, shortcuts, and troubleshooting
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Getting started
          </CardTitle>
          <CardDescription>Welcome experience and guided onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            New workspaces start with the onboarding wizard:{' '}
            <Link className="underline" to="/onboarding">
              /onboarding
            </Link>
            .
          </p>
          <p>
            Enable <strong>Demo Mode</strong> from the header to explore a sample organization,
            project, and live-looking data without connecting providers.
          </p>
          <p>
            The interactive product tour launches automatically for first-time users on Mission
            Control.
          </p>
          {projectId && (
            <p>
              Continue in your project:{' '}
              <Link className="underline" to={`/projects/${projectId}/mission-control`}>
                Mission Control
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Keyboard shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-start justify-between gap-4 text-sm border-b last:border-0 py-2">
              <kbd className="rounded border px-2 py-0.5 text-xs font-mono bg-muted">{s.keys}</kbd>
              <span className="text-muted-foreground text-right">{s.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Documentation
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>Admin, User, Deployment, Developer, API, Architecture, and Troubleshooting guides live in the repository under <code>docs/</code>.</p>
          <p>Production readiness pack: <code>docs/epic-11-production-readiness/</code></p>
          <p>Disaster recovery: <code>docs/ops/DR_RUNBOOK.md</code></p>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
