import { useNavigate, useParams } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { EmptyStateCard } from '@/components/demo/empty-state';
import { PageTransition } from '@/components/demo/page-transition';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { Badge } from '@/components/ui/badge';

export function PlaceholderPage({
  title,
  description,
  sprint,
}: {
  title: string;
  description: string;
  sprint?: string;
}) {
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const { isDemoMode } = useDemoMode();

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sprint && <Badge>{sprint}</Badge>}
        </div>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <EmptyStateCard
        icon={Construction}
        title={`${title} — Coming Soon`}
        description={
          isDemoMode
            ? `This module is on the roadmap. In the meantime, explore Mission Control, Campaigns, and AI Command Center for the full demo story.`
            : 'This page is wired in navigation so the full information architecture is visible. Enable Demo Mode for an interactive executive presentation.'
        }
        actionLabel={projectId ? 'Open Mission Control' : undefined}
        onAction={projectId ? () => navigate(`/projects/${projectId}/mission-control`) : undefined}
        aiCommand="Analyze Chefgaa"
        onAiCommand={projectId ? () => navigate(`/projects/${projectId}/command-center`) : undefined}
      />
    </PageTransition>
  );
}
