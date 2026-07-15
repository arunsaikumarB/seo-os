import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';

/** Compact strip showing the shared current opportunity across modules */
export function CurrentOpportunityBanner({
  projectId,
  allowClear = true,
}: {
  projectId: string;
  allowClear?: boolean;
}) {
  const { opportunity, clearOpportunity } = useCurrentOpportunity(projectId);
  if (!opportunity) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Current opportunity</p>
        <p className="font-medium truncate">
          {opportunity.website}
          {opportunity.domain ? (
            <span className="text-muted-foreground font-normal"> · {opportunity.domain}</span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className="text-[10px] capitalize">
          {(opportunity.backlink_type ?? opportunity.opportunity_type).replace(/_/g, ' ')}
        </Badge>
        <Badge className="text-[10px]">{opportunity.readiness}</Badge>
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/projects/${projectId}/campaigns/queue`}>Queue</Link>
        </Button>
        {allowClear && (
          <Button
            size="sm"
            variant="ghost"
            title="Clear current opportunity"
            onClick={() => clearOpportunity()}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
