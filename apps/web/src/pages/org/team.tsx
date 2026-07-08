import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { OrgRole } from '@seo-os/shared';

export function OrgTeamPage() {
  const { currentOrgId } = useAppStore();
  const { fetchMembers } = useApi();

  const { data, isLoading } = useQuery({
    queryKey: ['org-members', currentOrgId],
    queryFn: () => fetchMembers(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const members = (data?.data ?? []) as Array<{
    role: OrgRole;
    profile: { fullName: string | null } | null;
    userId: string;
  }>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-muted-foreground">Organization members and roles</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm font-medium">{m.profile?.fullName ?? m.userId}</span>
                <Badge className="capitalize">{m.role}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
