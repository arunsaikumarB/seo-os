import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Props = {
  projectId: string;
  campaignActive?: boolean;
};

/**
 * Phase 11 — Browser auto-submit UI removed. Point users to Assisted Manual only.
 * Underlying BEE / auto-publish policy remains dormant behind the server flag.
 */
export function HumanInterventionQueue({ projectId }: Props) {
  return (
    <Card className="rounded-2xl border-border/40">
      <CardContent className="pt-5 pb-4 space-y-3">
        <p className="text-sm font-medium">Assisted Manual submission</p>
        <p className="text-sm text-muted-foreground">
          Browser auto-submit is retired. Open each prepared package, paste the fields, clear
          login/CAPTCHA yourself, and submit on the site.
        </p>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/assisted-manual`}>
            Open Assisted Manual
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
