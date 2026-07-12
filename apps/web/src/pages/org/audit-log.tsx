import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';

type AuditRow = {
  id: string;
  action?: string;
  event_type?: string;
  actor_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export function OrgAuditLogPage() {
  const { currentOrgId } = useAppStore();
  const { request } = useApi();

  const audit = useQuery({
    queryKey: ['org-audit', currentOrgId],
    queryFn: () =>
      request<{ data: { items: AuditRow[] } }>(
        `/v1/organizations/${currentOrgId}/audit?limit=100`,
        { orgId: currentOrgId }
      ),
    enabled: !!currentOrgId,
  });

  const items = audit.data?.data.items ?? [];

  if (!currentOrgId) {
    return <p className="text-muted-foreground p-6">Select an organization to view the audit log.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ScrollText className="h-6 w-6" /> Audit Log
        </h1>
        <p className="text-muted-foreground">
          Security and administrative activity for this organization (admin access required)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Latest {items.length || 100} events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {audit.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : audit.isError ? (
            <p className="text-sm text-destructive">
              Unable to load audit log. Admin role is required.
            </p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit events yet"
              description="Organization actions such as member changes and critical updates will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">Resource</th>
                    <th className="py-2 font-medium">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge className="text-[10px]">
                          {row.action ?? row.event_type ?? 'event'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {row.resource_type
                          ? `${row.resource_type}${row.resource_id ? ` · ${row.resource_id.slice(0, 8)}` : ''}`
                          : '—'}
                      </td>
                      <td className="py-2 text-xs font-mono text-muted-foreground">
                        {row.actor_id ? row.actor_id.slice(0, 8) : 'system'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
