import { Link } from 'react-router-dom';
import { BookOpen, Keyboard, LifeBuoy, Sparkles, Bot, MessageSquarePlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/demo/page-transition';
import { useAppStore } from '@/stores/app-store';
import { useDemoMode } from '@/hooks/use-demo-mode';

const SHORTCUTS = [
  { keys: 'Ctrl/⌘ + K', description: 'Open command palette' },
  { keys: '?', description: 'Open Help Center' },
  { keys: 'Esc', description: 'Close dialogs and tours' },
  { keys: 'Tab / Shift+Tab', description: 'Move focus between interactive controls' },
];

const TIPS = [
  'Start with a website scan, then open Opportunity Explorer — that is the fastest path to first value.',
  'Use Demo Mode for client walkthroughs without touching production data.',
  'Submit Closed Beta feedback with severity + screenshot URL so we can triage quickly.',
];

export function HelpCenterPage() {
  const projectId = useAppStore((s) => s.currentProjectId);
  const { setShowTour } = useDemoMode();

  return (
    <PageTransition className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <LifeBuoy className="h-6 w-6" /> Help Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Onboarding, tours, shortcuts, contextual tips, and AI help
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Getting started (&lt; 15 minutes)
          </CardTitle>
          <CardDescription>Welcome experience and guided onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Complete{' '}
            <Link className="underline" to="/onboarding">
              onboarding
            </Link>
            , then Mission Control → scan → opportunities → campaign.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowTour(true)}>
              Restart guided tour
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/org/feedback">
                <MessageSquarePlus className="h-3 w-3 mr-1" /> Feedback Center
              </Link>
            </Button>
            {projectId && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/projects/${projectId}/command-center`}>
                  <Bot className="h-3 w-3 mr-1" /> AI Help Assistant
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contextual tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {TIPS.map((t) => (
            <p key={t}>• {t}</p>
          ))}
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
            <div
              key={s.keys}
              className="flex items-start justify-between gap-4 text-sm border-b last:border-0 py-2"
            >
              <kbd className="rounded border px-2 py-0.5 text-xs font-mono bg-muted">{s.keys}</kbd>
              <span className="text-muted-foreground text-right">{s.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Documentation & FAQ
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>
            Closed Beta pack: <code>docs/epic-12-closed-beta/</code>
          </p>
          <p>
            Production readiness: <code>docs/epic-11-production-readiness/</code>
          </p>
          <p>
            DR: <code>docs/ops/DR_RUNBOOK.md</code>
          </p>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
