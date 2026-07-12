import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import type { Organization } from '@seo-os/shared';

export function OrgSettingsGeneralPage() {
  const { currentOrgId } = useAppStore();
  const { request, fetchMe } = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const org = (me.data?.data.organizations ?? []).find((m) => m.org_id === currentOrgId)
    ?.organizations as Organization | undefined;

  useEffect(() => {
    if (org) {
      setName(org.name ?? '');
      setIndustry(org.industry ?? '');
    }
  }, [org?.id, org?.name, org?.industry]);

  const save = useMutation({
    mutationFn: () =>
      request<{ data: Organization }>(`/v1/organizations/${currentOrgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), industry: industry.trim() || undefined }),
        orgId: currentOrgId,
      }),
    onSuccess: () => {
      toast.success('Organization updated');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update organization'),
  });

  if (!currentOrgId) {
    return <p className="text-muted-foreground p-6">Select an organization to manage settings.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization settings</h1>
        <p className="text-muted-foreground">General preferences for your organization</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Name and industry used across projects and reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {me.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input id="org-slug" value={org?.slug ?? ''} disabled />
                <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-industry">Industry</Label>
                <Input
                  id="org-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. SaaS, Agency, E-commerce"
                />
              </div>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || name.trim().length < 2}
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
