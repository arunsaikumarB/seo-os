import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { openInterventionWindow } from '@/lib/intervention-window';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { PageTransition } from '@/components/demo/page-transition';

/**
 * Legacy route — opens the OAuth-style helper (real browser tab for the site).
 * Never embeds Playwright.
 */
export function BrowserAssistantPage() {
  const { projectId = '' } = useParams();
  const [params] = useSearchParams();
  const jobId = params.get('jobId');
  const interventions = useInterventions(projectId, 2_000);
  const first = jobId ?? interventions.data?.data.items?.[0]?.jobId ?? null;

  useEffect(() => {
    if (!projectId || !first) return;
    openInterventionWindow(projectId, first);
  }, [projectId, first]);

  return (
    <PageTransition className="max-w-lg mx-auto space-y-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Opening your browser…</h1>
      <p className="text-sm text-muted-foreground">
        Complete login or approval on the real website. SEO OS never embeds Playwright — a small
        helper watches for completion and resumes AI.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {first ? (
          <Button onClick={() => openInterventionWindow(projectId, first)}>Open Browser</Button>
        ) : null}
        <Button variant="outline" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/execution`}>Back to Submit Backlinks</Link>
        </Button>
      </div>
    </PageTransition>
  );
}
