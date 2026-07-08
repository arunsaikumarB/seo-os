import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { PIPELINE_STAGES, scoreBadgeClass, formatType } from '@/components/backlink-builder/types';
import { motion } from 'framer-motion';

const NEXT_STATUS: Partial<Record<string, string>> = {
  discovered: 'qualified',
  qualified: 'approved',
  approved: 'outreach_ready',
  outreach_ready: 'won',
};

export function BacklinkPipelinePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const pipeline = useQuery({
    queryKey: ['backlink-pipeline', projectId],
    queryFn: () =>
      request<{ data: Record<string, Array<Record<string, unknown>>> }>(
        `/v1/projects/${projectId}/backlink-builder/pipeline`
      ),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });

  const data = pipeline.data?.data ?? {};

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Backlink Pipeline"
        subtitle="Track prospects from discovery through outreach-ready — the backbone of your link building workflow."
      />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage, colIdx) => {
          const items = data[stage.id] ?? [];
          return (
            <Card key={stage.id} className="min-w-[240px] shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm flex items-center justify-between ${stage.color}`}>
                  <span>{stage.label}</span>
                  <Badge className="text-[10px] border-muted-foreground/30">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((p, idx) => (
                  <motion.div
                    key={String(p.id)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: colIdx * 0.05 + idx * 0.03 }}
                    className="rounded-md border p-2.5 text-xs space-y-1.5 bg-card hover:shadow-sm transition-shadow"
                  >
                    <p className="font-medium">{String(p.title ?? p.domain)}</p>
                    <p className="text-muted-foreground capitalize">
                      {formatType(String(p.prospect_type ?? ''))}
                    </p>
                    <Badge className={`text-[9px] ${scoreBadgeClass(Number(p.score ?? 0))}`}>
                      Score {String(p.score)}
                    </Badge>
                    {NEXT_STATUS[stage.id] && (
                      <p className="text-[10px] text-muted-foreground">
                        Next: {NEXT_STATUS[stage.id]!.replace(/_/g, ' ')}
                      </p>
                    )}
                  </motion.div>
                ))}
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Empty</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
