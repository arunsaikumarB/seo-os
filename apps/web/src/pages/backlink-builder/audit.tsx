import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkRecord } from '@/components/backlink-builder/types';
import { verificationBadgeClass, formatType } from '@/components/backlink-builder/types';
import { ShieldCheck } from 'lucide-react';

type AuditData = {
  summary: { total: number; verified: number; pending: number; lost: number };
  backlinks: BacklinkRecord[];
  recentChecks: Array<{ id: string; status: string; notes?: string; checked_at: string }>;
};

export function BacklinkAuditPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const audit = useQuery({
    queryKey: ['backlink-audit', projectId],
    queryFn: () =>
      request<{ data: AuditData }>(`/v1/projects/${projectId}/backlink-builder/audit`),
    enabled: !!projectId,
  });

  const data = audit.data?.data;

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Link Audit"
        subtitle="Full verification audit — health summary, backlink inventory, and recent checks."
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: data.summary.total },
            { label: 'Verified', value: data.summary.verified },
            { label: 'Pending', value: data.summary.pending },
            { label: 'Lost', value: data.summary.lost },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold">
                  <AnimatedCounter value={s.value} />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Backlink Inventory
            </CardTitle>
            <CardDescription>All tracked backlinks and verification status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {(data?.backlinks ?? []).map((bl) => (
              <div key={bl.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{bl.domain}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{formatType(bl.backlink_type)}</p>
                </div>
                <Badge className={verificationBadgeClass(bl.verification_status)}>
                  {bl.verification_status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Checks</CardTitle>
            <CardDescription>Verification history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {(data?.recentChecks ?? []).map((check) => (
              <div key={check.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <Badge className={verificationBadgeClass(check.status)}>{check.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(check.checked_at).toLocaleString()}
                  </span>
                </div>
                {check.notes && <p className="text-xs text-muted-foreground mt-1">{check.notes}</p>}
              </div>
            ))}
            {(data?.recentChecks ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No checks recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
