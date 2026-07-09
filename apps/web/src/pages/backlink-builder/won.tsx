import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkRecord } from '@/components/backlink-builder/types';
import { verificationBadgeClass, formatType } from '@/components/backlink-builder/types';
import { Trophy } from 'lucide-react';

export function BacklinkWonPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const won = useQuery({
    queryKey: ['backlink-won', projectId],
    queryFn: () =>
      request<{ data: BacklinkRecord[] }>(`/v1/projects/${projectId}/backlink-builder/won`),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Won Backlinks"
        subtitle="Every link you've secured — track verification status and anchor details."
      />

      <div className="grid gap-3">
        {(won.data?.data ?? []).map((bl) => (
          <Card key={bl.id}>
            <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary shrink-0" />
                  {bl.domain}
                </p>
                <p className="text-xs text-muted-foreground truncate">{bl.source_url}</p>
                {bl.anchor_text && <p className="text-xs">Anchor: &quot;{bl.anchor_text}&quot;</p>}
                <Badge className="text-[10px] capitalize">{formatType(bl.backlink_type)}</Badge>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className={verificationBadgeClass(bl.verification_status)}>
                  {bl.verification_status}
                </Badge>
                {bl.won_at && (
                  <span className="text-[10px] text-muted-foreground">
                    Won {new Date(bl.won_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {(won.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No won backlinks yet.</p>
        )}
      </div>
    </div>
  );
}
