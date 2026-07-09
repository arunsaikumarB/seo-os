import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkRecord } from '@/components/backlink-builder/types';
import { formatType } from '@/components/backlink-builder/types';
import { XCircle } from 'lucide-react';

export function BacklinkLostPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const lost = useQuery({
    queryKey: ['backlink-lost', projectId],
    queryFn: () =>
      request<{ data: BacklinkRecord[] }>(`/v1/projects/${projectId}/backlink-builder/lost`),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Lost Backlinks"
        subtitle="Links that were removed or became unreachable — monitor and plan recovery."
      />

      <div className="grid gap-3">
        {(lost.data?.data ?? []).map((bl) => (
          <Card key={bl.id}>
            <CardContent className="pt-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  {bl.domain}
                </p>
                <p className="text-xs text-muted-foreground truncate">{bl.source_url}</p>
                <Badge className="text-[10px] capitalize mt-1">
                  {formatType(bl.backlink_type)}
                </Badge>
              </div>
              <Badge className="border-destructive/30 text-destructive">lost</Badge>
            </CardContent>
          </Card>
        ))}
        {(lost.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No lost backlinks.</p>
        )}
      </div>
    </div>
  );
}
